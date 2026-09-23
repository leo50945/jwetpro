'use strict';

const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {onDocumentCreated,onDocumentWritten}=require('firebase-functions/v2/firestore');
const {
  ENGINE_VERSION,seriesProfiles,simulateMopyonGame,simulateDominoGame,hashText,fingerprintSimilarity
}=require('./simulation-bot-core');
const {playerLevelName}=require('./domino-rewards-core');
const {starterUidForGame} = require('./match-start-rules');

const REGION='us-central1';
const BRACKET_SIZE=32;
const MAX_DRAW_GAMES=8;
const JOB_LEASE_MS=9*60*1000;
const ROUNDS=Object.freeze([
  {key:'16e',label:'16èmes de finale',matches:16,points:10},
  {key:'8e',label:'8èmes de finale',matches:8,points:15},
  {key:'quart',label:'Quarts de finale',matches:4,points:25},
  {key:'demi',label:'Demi-finales',matches:2,points:40},
  {key:'finale',label:'Finale',matches:1,points:75}
]);
const validId=value=>/^[A-Za-z0-9_-]{1,150}$/.test(String(value||''));
const roundDefinition=key=>ROUNDS.find(round=>round.key===key)||null;
const seedOrder=size=>{let seeds=[1];while(seeds.length<size){const total=seeds.length*2,next=[];seeds.forEach(seed=>{next.push(seed,total+1-seed);});seeds=next;}return seeds;};
const playerFromRegistration=(document,index)=>{const data=document.data()||{};return{uid:String(data.uid||document.id),name:String(data.displayName||data.name||data.username||`Joueur ${index+1}`),seed:Math.max(1,Number(data.seed)||index+1),real:data.real===true};};
const seriesIdFor=(championshipId,roundKey,index)=>`${championshipId}-${roundKey}-${index+1}`;
const participantIsBot=player=>player&&player.real!==true;
const seriesIsBotOnly=series=>participantIsBot(series.player1)&&participantIsBot(series.player2);
const selectBotSeries=(documents,requestedIds=[])=>{
  const requested=[...new Set(requestedIds.map(String))];
  const selected=requested.length?documents.filter(document=>requested.includes(document.id)):documents;
  return{
    candidates:requested.length?selected:selected.filter(document=>seriesIsBotOnly(document.data())),
    missing:requested.length>selected.length,
    containsReal:requested.length>0&&selected.some(document=>!seriesIsBotOnly(document.data()))
  };
};
const timestampFromMillis=(admin,millis)=>admin.firestore.Timestamp.fromMillis(Math.max(0,Math.floor(millis)));

module.exports=({admin,db,isAdmin})=>{
  const championshipCore=data=>({
    game:data.game,entryFee:Number(data.entryFee)||0,prize:Number(data.prize)||0,
    maxPlayers:BRACKET_SIZE,rounds:ROUNDS.length,startAt:data.startAt
  });
  const seriesData=(championship,championshipId,round,index,player1,player2)=>({
    kind:'series',format:'bo3',championshipId,game:championship.game,number:championship.number||'',
    round:round.key,roundLabel:round.label,bracketSlot:index,
    player1:{uid:player1.uid,name:player1.name,seed:player1.seed??null,real:player1.real===true},
    player2:{uid:player2.uid,name:player2.name,seed:player2.seed??null,real:player2.real===true},
    participantIds:[player1.uid,player2.uid],participantNames:{[player1.uid]:player1.name,[player2.uid]:player2.name},
    participantTypes:{[player1.uid]:player1.real===true?'real':'simulated',[player2.uid]:player2.real===true?'real':'simulated'},
    botParticipantIds:[player1,player2].filter(participantIsBot).map(player=>player.uid),
    status:'preview',seriesScore:{p1:0,p2:0},gameIds:[],currentGameId:null,winnerUid:null,winnerName:null,
    startAt:championship.startAt||championship.startDate||admin.firestore.Timestamp.now(),scheduledAt:championship.startAt||championship.startDate||admin.firestore.Timestamp.now(),
    simulation:true,simulationRunId:championship.simulationRunId||'',
    createdAt:admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()
  });

  async function ensureSimulationBracket(championshipId,{repair=false}={}){
    const championshipRef=db.collection('championships').doc(championshipId);
    return db.runTransaction(async transaction=>{
      const championshipSnapshot=await transaction.get(championshipRef);
      if(!championshipSnapshot.exists)throw new Error('championship-not-found');
      const championship=championshipSnapshot.data()||{};
      if(championship.simulation!==true)throw new Error('not-a-simulation');
      if(championship.currentRound){return{ready:true,alreadyReady:true,round:championship.currentRound};}
      if(championship.status!=='registration-open'&&!repair)throw new Error('registration-not-open');
      const registrations=await transaction.get(championshipRef.collection('registrations').orderBy('seed'));
      if(registrations.size<BRACKET_SIZE)return{ready:false,count:registrations.size};
      const players=registrations.docs.slice(0,BRACKET_SIZE).map(playerFromRegistration);
      if(new Set(players.map(player=>player.uid)).size!==BRACKET_SIZE)throw new Error('duplicate-participant');
      const bySeed=new Map(players.map(player=>[player.seed,player])),slots=seedOrder(BRACKET_SIZE).map(seed=>bySeed.get(seed));
      if(slots.some(player=>!player))throw new Error('invalid-seeding');
      const round=ROUNDS[0];
      for(let index=0;index<round.matches;index+=1){
        const ref=db.collection('matches').doc(seriesIdFor(championshipId,round.key,index));
        transaction.set(ref,seriesData(championship,championshipId,round,index,slots[index*2],slots[index*2+1]),{merge:false});
      }
      transaction.set(championshipRef,{
        ...championshipCore(championship),status:'ongoing',currentRound:round.key,currentRoundLabel:round.label,
        registeredCount:BRACKET_SIZE,participants:players.map(player=>({uid:player.uid,displayName:player.name,seed:player.seed,real:player.real})),
        bracketGenerationStatus:'ready',bracketGeneratedAt:admin.firestore.FieldValue.serverTimestamp(),bracketError:admin.firestore.FieldValue.delete(),updatedAt:admin.firestore.FieldValue.serverTimestamp()
      },{merge:true});
      return{ready:true,alreadyReady:false,round:round.key,seriesCount:round.matches};
    });
  }

  async function markBracketFailure(championshipId,error){
    await db.collection('championships').doc(championshipId).set({bracketGenerationStatus:'failed',bracketError:String(error?.message||error).slice(0,300),updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
  }

  const autoCloseSimulationRegistration=onDocumentCreated({document:'championships/{championshipId}/registrations/{registrationId}',region:REGION,retry:false},async event=>{
    const championshipId=event.params.championshipId;
    try{return await ensureSimulationBracket(championshipId);}
    catch(error){
      if(!['not-a-simulation','registration-not-open'].includes(error.message))await markBracketFailure(championshipId,error);
      return null;
    }
  });

  const repairSimulationBracket=onCall({region:REGION,cors:true},async request=>{
    if(!(await isAdmin(request)))throw new HttpsError('permission-denied','Administrator access is required.');
    const championshipId=String(request.data?.championshipId||'');
    if(!validId(championshipId))throw new HttpsError('invalid-argument','A valid championship id is required.');
    try{return await ensureSimulationBracket(championshipId,{repair:true});}
    catch(error){await markBracketFailure(championshipId,error);throw new HttpsError('failed-precondition',`Bracket generation failed: ${error.message}`);}
  });

  async function enqueueSeries(championship,seriesDocuments,{queueSource='admin'}={}){
    if(!seriesDocuments.length)return[];
    const outcomes=await Promise.all(seriesDocuments.map(document=>db.runTransaction(async transaction=>{
      const jobRef=db.collection('simulationBotJobs').doc(document.id);
      const [latestSeriesSnapshot,jobSnapshot]=await Promise.all([transaction.get(document.ref),transaction.get(jobRef)]);
      if(!latestSeriesSnapshot.exists)return null;
      const series=latestSeriesSnapshot.data()||{},job=jobSnapshot.data()||{};
      if(series.status==='completed'||!seriesIsBotOnly(series)||['queued','processing','completed'].includes(job.status))return null;
      const seed=hashText(`${championship.simulationRunId||championship.id||''}:${document.id}:${Date.now()}:${Math.random()}`).slice(0,24);
      transaction.set(jobRef,{
        championshipId:series.championshipId,simulationRunId:series.simulationRunId||'',seriesId:document.id,
        round:series.round,game:series.game,status:'queued',progress:{completedGames:0,targetWins:2},
        seed,engineVersion:ENGINE_VERSION,queueSource,attempt:admin.firestore.FieldValue.increment(1),
        queueGeneration:admin.firestore.FieldValue.increment(1),error:admin.firestore.FieldValue.delete(),
        queuedAt:admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()
      },{merge:true});
      transaction.set(document.ref,{simulationJobStatus:'queued',simulationJobError:admin.firestore.FieldValue.delete(),updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
      return document.id;
    })));
    return outcomes.filter(Boolean);
  }

  async function enqueueRoundBotSeries(championshipId,roundKey,options={}){
    const [championshipSnapshot,seriesSnapshot]=await Promise.all([
      db.collection('championships').doc(championshipId).get(),
      db.collection('matches').where('championshipId','==',championshipId).get()
    ]);
    if(!championshipSnapshot.exists)return[];
    const seriesDocuments=seriesSnapshot.docs.filter(document=>document.data()?.kind==='series'&&document.data()?.round===roundKey&&document.data()?.status!=='completed'&&seriesIsBotOnly(document.data()));
    return enqueueSeries({id:championshipId,...championshipSnapshot.data()},seriesDocuments,options);
  }

  const enqueueSimulationBotMatches=onCall({region:REGION,cors:true},async request=>{
    if(!(await isAdmin(request)))throw new HttpsError('permission-denied','Administrator access is required.');
    const championshipId=String(request.data?.championshipId||''),requested=Array.isArray(request.data?.seriesIds)?[...new Set(request.data.seriesIds.map(String))]:[];
    if(!validId(championshipId)||requested.some(id=>!validId(id))||requested.length>32)throw new HttpsError('invalid-argument','Invalid simulation selection.');
    const championshipSnapshot=await db.collection('championships').doc(championshipId).get();
    if(!championshipSnapshot.exists)throw new HttpsError('not-found','Championship not found.');
    const championship=championshipSnapshot.data()||{};
    if(championship.simulation!==true||!championship.currentRound)throw new HttpsError('failed-precondition','This simulation has no active round.');
    const querySnapshot=await db.collection('matches').where('championshipId','==',championshipId).get();
    const roundSeries=querySnapshot.docs.filter(document=>document.data()?.kind==='series'&&document.data()?.round===championship.currentRound);
    const selection=selectBotSeries(roundSeries,requested);
    if(selection.missing)throw new HttpsError('not-found','One or more series do not belong to the current round.');
    if(selection.containsReal)throw new HttpsError('failed-precondition','A real-player match cannot be simulated.');
    // The round-wide action deliberately skips real-player series. They remain
    // manual and must not prevent all other bot-only confrontations from running.
    const candidates=selection.candidates;
    await championshipSnapshot.ref.set({botAutomationEnabled:true,botAutomationUpdatedAt:admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
    const queued=await enqueueSeries({id:championshipId,...championship},candidates,{queueSource:requested.length?'single':'round'});
    return{championshipId,round:championship.currentRound,queued,count:queued.length};
  });

  async function claimJob(jobRef,eventId){
    return db.runTransaction(async transaction=>{
      const snapshot=await transaction.get(jobRef);if(!snapshot.exists)return null;
      const job=snapshot.data()||{},now=Date.now(),lease=job.leaseExpiresAt?.toMillis?.()||0;
      if(job.status!=='queued'&&!(job.status==='processing'&&(lease<=now||job.leaseOwner===eventId)))return null;
      transaction.set(jobRef,{status:'processing',leaseOwner:eventId,leaseExpiresAt:timestampFromMillis(admin,now+JOB_LEASE_MS),startedAt:job.startedAt||admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
      transaction.set(db.collection('matches').doc(job.seriesId),{simulationJobStatus:'processing',updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
      return{...job,id:jobRef.id};
    });
  }

  function naturalTimes(admin,results,completedMillis){
    const total=results.reduce((sum,result)=>sum+Math.max(1000,result.durationMs||0),0)+Math.max(0,results.length-1)*45000;
    let cursor=completedMillis-total;
    return results.map(result=>{const start=cursor,end=start+Math.max(1000,result.durationMs||0);cursor=end+45000;return{startAt:timestampFromMillis(admin,start),completedAt:timestampFromMillis(admin,end),startMillis:start};});
  }

  async function awardSimulationSeries(series,seriesId,winnerUid){
    const participants=Array.isArray(series.participantIds)?series.participantIds:[];
    const loserUid=participants.find(uid=>uid!==winnerUid)||'',round=roundDefinition(series.round),rewardRef=db.collection('playerRewardEvents').doc(`simulation_series_${seriesId}`);
    if(!winnerUid||!loserUid||!round)return;
    await db.runTransaction(async transaction=>{
      const refs=[rewardRef,db.collection('leaderboard').doc(winnerUid),db.collection('leaderboard').doc(loserUid),db.collection('users').doc(winnerUid),db.collection('users').doc(loserUid)];
      const [reward,winnerBoard,loserBoard,winnerUser,loserUser]=await Promise.all(refs.map(ref=>transaction.get(ref)));
      if(reward.exists)return;
      const winnerDelta=round.points+(round.key==='final'?10:0),loserDelta=10;
      const winnerTotal=Math.max(0,Number(winnerUser.data()?.points??winnerBoard.data()?.points)||0)+winnerDelta;
      const loserTotal=Math.max(0,Number(loserUser.data()?.points??loserBoard.data()?.points)||0)+loserDelta;
      const names=series.participantNames||{};
      transaction.set(refs[1],{displayName:names[winnerUid]||'Joueur',points:winnerTotal,level:playerLevelName(winnerTotal),simulated:true,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
      transaction.set(refs[2],{displayName:names[loserUid]||'Joueur',points:loserTotal,level:playerLevelName(loserTotal),simulated:true,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
      transaction.set(refs[3],{points:winnerTotal,matchesPlayed:admin.firestore.FieldValue.increment(1),wins:admin.firestore.FieldValue.increment(1),updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
      transaction.set(refs[4],{points:loserTotal,matchesPlayed:admin.firestore.FieldValue.increment(1),updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
      transaction.create(rewardRef,{type:'simulation-series',seriesId,championshipId:series.championshipId,round:series.round,winnerUid,loserUid,rewards:{[winnerUid]:{pointsDelta:winnerDelta,pointsTotal:winnerTotal},[loserUid]:{pointsDelta:loserDelta,pointsTotal:loserTotal}},coupon:null,createdAt:admin.firestore.FieldValue.serverTimestamp()});
    });
  }

  async function runJob(jobRef,job){
    const seriesRef=db.collection('matches').doc(job.seriesId),seriesSnapshot=await seriesRef.get();
    if(!seriesSnapshot.exists)throw new Error('series-not-found');
    const series=seriesSnapshot.data()||{};
    if(series.simulation!==true||series.kind!=='series'||!seriesIsBotOnly(series))throw new Error('series-not-bot-only');
    if(series.status==='completed'&&series.winnerUid){await jobRef.set({status:'completed',winnerUid:series.winnerUid,completedAt:admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});return;}
    const participantIds=series.participantIds||[],participantNames=series.participantNames||{},profiles=seriesProfiles(participantIds,job.seed);
    const existingGames=await db.collection('matches').where('championshipId','==',series.championshipId).get();
    const knownSignatures=new Set(existingGames.docs.map(document=>document.data()?.simulationSignature).filter(Boolean));
    const knownFingerprints=existingGames.docs.map(document=>document.data()?.simulationFingerprint).filter(Array.isArray);
    const results=[],score={p1:0,p2:0};let draws=0,gameNumber=0;
    while(score.p1<2&&score.p2<2){
      gameNumber+=1;let result=null,accepted=false;
      for(let variant=0;variant<12;variant+=1){
        const gameSeed=hashText(`${job.seed}:g${gameNumber}:v${variant}`).slice(0,24);
        const startingPlayerId=starterUidForGame(participantIds,gameNumber,job.seriesId);
        result=series.game==='domino'?simulateDominoGame({participantIds,participantNames,seed:gameSeed,profiles,startingPlayerId,gameNumber,seriesId:job.seriesId}):simulateMopyonGame({participantIds,participantNames,seed:gameSeed,startingPlayerId,profiles});
        const tooSimilar=knownFingerprints.some(fingerprint=>fingerprintSimilarity(fingerprint,result.fingerprint)>=.82);
        if(!knownSignatures.has(result.signature)&&!tooSimilar){knownSignatures.add(result.signature);knownFingerprints.push(result.fingerprint);accepted=true;break;}
      }
      if(!accepted)throw new Error('replay-pattern-too-similar');
      if(result.draw){draws+=1;if(draws>=MAX_DRAW_GAMES)throw new Error('too-many-draws');}
      else if(result.winnerId===participantIds[0])score.p1+=1;else if(result.winnerId===participantIds[1])score.p2+=1;else throw new Error('invalid-game-winner');
      results.push(result);
      await jobRef.set({progress:{completedGames:results.length,targetWins:2,seriesScore:{...score},draws},updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
    }
    const winnerUid=score.p1>=2?participantIds[0]:participantIds[1],winnerName=participantNames[winnerUid]||'Joueur';
    const completedMillis=Date.now(),times=naturalTimes(admin,results,completedMillis),batch=db.batch(),gameIds=[];
    results.forEach((result,index)=>{
      const gameId=`${job.seriesId.slice(0,136)}-auto-g${index+1}`,gameRef=db.collection('matches').doc(gameId),timing=times[index];gameIds.push(gameId);
      const common={kind:'game',seriesId:job.seriesId,seriesFormat:'bo3',gameNumber:index+1,championshipId:series.championshipId,number:series.number||'',round:series.round,roundLabel:series.roundLabel,bracketSlot:series.bracketSlot,participantIds,participantNames,participantTypes:series.participantTypes||{},botParticipantIds:[...participantIds],simulation:true,isSimulation:true,simulationRunId:series.simulationRunId||'',engineVersion:ENGINE_VERSION,simulationSeed:result.seed,simulationProfiles:profiles,simulationSignature:result.signature,simulationFingerprint:result.fingerprint,status:'completed',winnerId:result.winnerId||null,winnerName:result.winnerId?participantNames[result.winnerId]||'Joueur':null,draw:result.draw,startAt:timing.startAt,scheduledAt:timing.startAt,completedAt:timing.completedAt,updatedAt:admin.firestore.FieldValue.serverTimestamp(),visibility:'public'};
      if(result.game==='mopyon')batch.set(gameRef,{...common,game:'mopyon',type:'mopyon',playerSymbols:result.symbols,board:result.board,winningLine:result.winningLine,moves:result.moves.map(move=>({...move,createdAt:timestampFromMillis(admin,timing.startMillis+move.elapsedMs)}))});
      else{
        const publicMoves=result.events.map(event=>{const move={type:event.type,playerId:event.playerId,actionNumber:event.actionNumber,automated:true,elapsedMs:event.elapsedMs,decisionProfile:event.decisionProfile,createdAt:timestampFromMillis(admin,timing.startMillis+event.elapsedMs)};if(event.type==='play')Object.assign(move,{tile:event.tile,tileId:event.tileId,side:event.side,boardAfter:event.boardAfter});return move;});
        batch.set(gameRef,{
          ...common,game:'domino',type:'domino',board:result.state.boardTiles,moves:publicMoves,
          currentPlayerId:result.state.currentPlayerId||null,actionNumber:result.state.actionNumber,
          endReason:result.state.endReason||null,scores:result.state.scores||{},
          remainingTileCounts:Object.fromEntries(participantIds.map(uid=>[uid,(result.state.hands?.[uid]||[]).length]))
        });
        batch.set(db.collection('dominoMatchStates').doc(gameId),{...result.state,engineVersion:ENGINE_VERSION,simulationSeed:result.seed,createdAt:timing.startAt,updatedAt:timing.completedAt});
      }
    });
    await batch.commit();
    await awardSimulationSeries(series,job.seriesId,winnerUid);
    await db.runTransaction(async transaction=>{
      const latestSeries=await transaction.get(seriesRef);
      if(!latestSeries.exists)throw new Error('series-deleted-before-finalization');
      transaction.set(seriesRef,{status:'completed',seriesScore:score,gameIds,currentGameId:null,activeGameId:null,winnerUid,winnerId:winnerUid,winnerName,simulationJobStatus:'completed',engineVersion:ENGINE_VERSION,simulationSeed:job.seed,simulationProfiles:profiles,completedAt:timestampFromMillis(admin,completedMillis),updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
      transaction.set(jobRef,{status:'completed',progress:{completedGames:results.length,targetWins:2,seriesScore:score,draws},winnerUid,winnerName,gameIds,leaseOwner:admin.firestore.FieldValue.delete(),leaseExpiresAt:admin.firestore.FieldValue.delete(),completedAt:admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
    });
  }

  const processSimulationBotJob=onDocumentWritten({document:'simulationBotJobs/{seriesId}',region:REGION,timeoutSeconds:540,memory:'1GiB',maxInstances:6,concurrency:1,retry:true},async event=>{
    const after=event.data?.after;if(!after?.exists||after.data()?.status!=='queued')return;
    const beforeGeneration=Number(event.data?.before?.data()?.queueGeneration)||0,afterGeneration=Number(after.data()?.queueGeneration)||0;
    if(event.data?.before?.exists&&event.data.before.data()?.status==='queued'&&beforeGeneration===afterGeneration)return;
    const jobRef=after.ref,job=await claimJob(jobRef,event.id);if(!job)return;
    try{await runJob(jobRef,job);}
    catch(error){await Promise.all([
      jobRef.set({status:'failed',error:String(error?.message||error).slice(0,300),leaseOwner:admin.firestore.FieldValue.delete(),leaseExpiresAt:admin.firestore.FieldValue.delete(),failedAt:admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true}),
      db.collection('matches').doc(job.seriesId).set({simulationJobStatus:'failed',simulationJobError:String(error?.message||error).slice(0,300),updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true})
    ]);}
  });

  async function progressSimulationRound(championshipId,expectedRound){
    const championshipRef=db.collection('championships').doc(championshipId);
    const result=await db.runTransaction(async transaction=>{
      const championshipSnapshot=await transaction.get(championshipRef);if(!championshipSnapshot.exists)return null;
      const championship=championshipSnapshot.data()||{};
      if(championship.simulation!==true||championship.currentRound!==expectedRound)return null;
      const matches=await transaction.get(db.collection('matches').where('championshipId','==',championshipId));
      const series=matches.docs.filter(document=>document.data()?.kind==='series'&&document.data()?.round===expectedRound).sort((a,b)=>(a.data()?.bracketSlot||0)-(b.data()?.bracketSlot||0));
      const round=roundDefinition(expectedRound);if(!round||series.length!==round.matches||series.some(document=>document.data()?.status!=='completed'||!document.data()?.winnerUid))return null;
      const winners=series.map(document=>{const data=document.data(),player=data.player1?.uid===data.winnerUid?data.player1:data.player2;return{uid:data.winnerUid,name:data.winnerName||player?.name||'Joueur',seed:player?.seed??null,real:player?.real===true};});
      const roundIndex=ROUNDS.findIndex(item=>item.key===expectedRound);
      if(roundIndex===ROUNDS.length-1){
        const final=series[0].data(),runner=final.player1?.uid===final.winnerUid?final.player2:final.player1;
        transaction.set(championshipRef,{...championshipCore(championship),status:'completed',currentRound:null,currentRoundLabel:null,championUid:winners[0].uid,championName:winners[0].name,completedAt:admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
        transaction.set(db.collection('results').doc(`${championshipId}-result`),{championshipId,game:championship.game,number:championship.number||'',winnerUid:winners[0].uid,winnerName:winners[0].name,runnerUpUid:runner?.uid||'',runnerUpName:runner?.name||'',prize:Number(championship.prize)||0,status:'published',simulation:true,simulationRunId:championship.simulationRunId||'',createdAt:admin.firestore.FieldValue.serverTimestamp(),updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
        return{completed:true};
      }
      const next=ROUNDS[roundIndex+1];
      for(let index=0;index<next.matches;index+=1){const ref=db.collection('matches').doc(seriesIdFor(championshipId,next.key,index));transaction.set(ref,seriesData(championship,championshipId,next,index,winners[index*2],winners[index*2+1]),{merge:false});}
      transaction.set(championshipRef,{...championshipCore(championship),status:'ongoing',currentRound:next.key,currentRoundLabel:next.label,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});
      return{completed:false,nextRound:next.key,automation:championship.botAutomationEnabled===true};
    });
    if(result?.nextRound&&result.automation)await enqueueRoundBotSeries(championshipId,result.nextRound,{queueSource:'automatic-next-round'});
    return result;
  }

  const advanceSimulationAfterSeriesCompleted=onDocumentWritten({document:'matches/{matchId}',region:REGION,retry:true},async event=>{
    const before=event.data?.before?.data()||{},after=event.data?.after?.data()||{};
    if(after.kind!=='series'||after.simulation!==true||after.status!=='completed'||before.status==='completed'||!validId(after.championshipId)||!roundDefinition(after.round))return;
    return progressSimulationRound(after.championshipId,after.round);
  });

  const rescheduleChampionshipStart=onCall({region:REGION,cors:true,maxInstances:1,concurrency:1,memory:'256MiB',timeoutSeconds:60},async request=>{
    if(!(await isAdmin(request)))throw new HttpsError('permission-denied','Administrator access is required.');
    const championshipId=String(request.data?.championshipId||'');
    const requestedStart=String(request.data?.startAt||'');
    if(!validId(championshipId)||!requestedStart)throw new HttpsError('invalid-argument','A valid championship and start date are required.');
    const startMillis=Date.parse(requestedStart);
    if(!Number.isFinite(startMillis)||startMillis<=Date.now())throw new HttpsError('invalid-argument','The new opening time must be in the future.');
    const championshipRef=db.collection('championships').doc(championshipId);
    const championshipSnapshot=await championshipRef.get();
    if(!championshipSnapshot.exists)throw new HttpsError('not-found','Championship not found.');
    const championship=championshipSnapshot.data()||{};
    if(championship.simulation!==true)throw new HttpsError('failed-precondition','Only simulation championships can be rescheduled here.');
    if(championship.status==='completed'||championship.status==='cancelled')throw new HttpsError('failed-precondition','This championship is already closed.');
    const registeredCount=Number(championship.registeredCount)||0;
    const capacity=Math.min(BRACKET_SIZE,Math.max(1,Number(championship.maxPlayers)||BRACKET_SIZE));
    if(registeredCount<capacity)throw new HttpsError('failed-precondition','Close all registrations before changing the opening time.');
    const startAt=timestampFromMillis(admin,startMillis);
    const now=admin.firestore.FieldValue.serverTimestamp();
    await championshipRef.set({startAt,scheduledAt:startAt,updatedAt:now,scheduleChangedAt:now,scheduleChangedBy:request.auth?.uid||null},{merge:true});
    const matches=await db.collection('matches').where('championshipId','==',championshipId).get();
    const batch=db.batch();let updatedMatches=0;
    matches.docs.forEach(document=>{
      const data=document.data()||{};
      if(data.kind==='series'&&data.status!=='completed'){
        batch.set(document.ref,{startAt,scheduledAt:startAt,updatedAt:now},{merge:true});updatedMatches+=1;
      }
    });
    if(updatedMatches)await batch.commit();
    return{championshipId,startAt:startAt.toDate().toISOString(),updatedMatches};
  });

  return{autoCloseSimulationRegistration,repairSimulationBracket,enqueueSimulationBotMatches,processSimulationBotJob,advanceSimulationAfterSeriesCompleted,rescheduleChampionshipStart};
};

module.exports._test={BRACKET_SIZE,MAX_DRAW_GAMES,ROUNDS,seedOrder,seriesIdFor,seriesIsBotOnly,selectBotSeries,roundDefinition};
