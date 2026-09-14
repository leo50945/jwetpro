(function initJwetproSocial(){
  'use strict';
  if (window.JwetproSocial) return;
  const SHARE_ORIGIN='https://jwetpro-share.web.app';
  const FIREBASE_VERSION='10.12.2';
  const state=new Map();
  const playerProfilesByName=new Map();
  let playerProfilesLoaded=false;
  let refreshTimer=0;
  let functionsReadyPromise=null;
  const ht=()=>localStorage.getItem('jwetpro-language')==='ht';
  const words=()=>ht()?{
    like:'Mete nan favori',unlike:'Retire nan favori',share:'Pataje',copy:'Kopye lyen an',native:'Pataje ak aplikasyon mwen yo',whatsapp:'WhatsApp',facebook:'Facebook',close:'Fèmen',login:'Konekte pou mete sa nan favori.',copied:'Lyen an kopye.',unavailable:'Aksyon sa pa disponib pou kounye a.'
  }:{
    like:'Ajouter aux favoris',unlike:'Retirer des favoris',share:'Partager',copy:'Copier le lien',native:'Partager avec mes applications',whatsapp:'WhatsApp',facebook:'Facebook',close:'Fermer',login:'Connectez-vous pour ajouter cet élément aux favoris.',copied:'Lien copié.',unavailable:'Cette action est indisponible pour le moment.'
  };
  const icon=name=>name==='heart'?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/></svg>';
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const key=(kind,id)=>`${kind}:${id}`;
  const loadScript=src=>new Promise((resolve,reject)=>{const existing=[...document.scripts].find(item=>item.src===src);if(existing){if(existing.dataset.loaded==='true'||(src.includes('firebase-auth')&&window.firebase?.auth)||(src.includes('firebase-functions')&&window.firebase?.functions))return resolve();existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true});return}const script=document.createElement('script');script.src=src;script.addEventListener('load',()=>{script.dataset.loaded='true';resolve()},{once:true});script.addEventListener('error',reject,{once:true});document.head.append(script)});
  const ensureFunctions=()=>{
    if(functionsReadyPromise)return functionsReadyPromise;
    functionsReadyPromise=(async()=>{
      if(!window.firebase)return false;
      if(!firebase.auth)await loadScript(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth-compat.js`);
      if(!firebase.functions)await loadScript(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-functions-compat.js`);
      return Boolean(firebase.apps?.length&&firebase.auth&&firebase.functions);
    })().catch(()=>false);
    return functionsReadyPromise;
  };
  const toast=message=>{const node=document.createElement('div');node.className='social-system-toast';node.textContent=message;document.body.append(node);requestAnimationFrame(()=>node.classList.add('is-visible'));setTimeout(()=>{node.classList.remove('is-visible');setTimeout(()=>node.remove(),250)},2700)};
  const modal=document.createElement('div');
  modal.className='social-share-layer';modal.hidden=true;
  modal.innerHTML='<section class="social-share-dialog" role="dialog" aria-modal="true" aria-labelledby="social-share-title"><header class="social-share-head"><small>JWETPRO</small><h2 id="social-share-title"></h2><button class="social-share-close" type="button" aria-label="Fermer">×</button></header><div class="social-share-options"><button class="social-share-primary" type="button" data-social-native></button><a data-social-whatsapp target="_blank" rel="noopener">WhatsApp</a><a data-social-facebook target="_blank" rel="noopener">Facebook</a><button type="button" data-social-copy></button><button type="button" data-social-close></button></div></section>';
  document.body.append(modal);
  let activeShare=null;
  let shareTrigger=null;
  const shareFocusable=()=>[...modal.querySelectorAll('button:not([disabled]),a[href]')].filter(node=>!node.hidden);
  const closeShare=()=>{
    if(modal.hidden)return;
    modal.hidden=true;
    document.body.classList.remove('social-share-open');
    activeShare=null;
    const target=shareTrigger;
    shareTrigger=null;
    if(target?.isConnected)target.focus();
  };
  const copy=async url=>{try{await navigator.clipboard.writeText(url);toast(words().copied)}catch{window.prompt(words().copy,url)}};
  const openShare=(kind,id,title,trigger=null)=>{
    const code=kind==='championship'?'c':'m';const url=`${SHARE_ORIGIN}/s/${code}/${encodeURIComponent(id)}`;const text=title||'JWETPRO';activeShare={url,title:text,text};
    shareTrigger=trigger||document.activeElement;
    modal.querySelector('#social-share-title').textContent=text;modal.querySelector('[data-social-native]').textContent=words().native;modal.querySelector('[data-social-copy]').textContent=words().copy;modal.querySelector('[data-social-close]').textContent=words().close;modal.querySelector('[data-social-whatsapp]').href=`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;modal.querySelector('[data-social-facebook]').href=`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;modal.hidden=false;document.body.classList.add('social-share-open');modal.querySelector('[data-social-native]').focus();
  };
  modal.addEventListener('click',event=>{if(event.target===modal||event.target.closest('.social-share-close')||event.target.closest('[data-social-close]'))closeShare()});
  modal.querySelector('[data-social-copy]').addEventListener('click',()=>activeShare&&copy(activeShare.url));
  modal.querySelector('[data-social-native]').addEventListener('click',async()=>{if(!activeShare)return;if(navigator.share){try{await navigator.share(activeShare)}catch(error){if(error.name!=='AbortError')copy(activeShare.url)}}else copy(activeShare.url)});
  document.addEventListener('keydown',event=>{
    if(modal.hidden)return;
    if(event.key==='Escape'){event.preventDefault();closeShare();return}
    if(event.key!=='Tab')return;
    const focusable=shareFocusable();if(!focusable.length)return;
    const first=focusable[0];const last=focusable[focusable.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  },true);
  const updateNode=node=>{const value=state.get(key(node.dataset.socialKind,node.dataset.socialId))||{liked:false,likeCount:0};const button=node.querySelector('[data-entity-like]');const count=node.querySelector('.entity-like-count');if(!button)return;button.classList.toggle('is-liked',value.liked);button.setAttribute('aria-pressed',String(value.liked));button.setAttribute('aria-label',value.liked?words().unlike:words().like);if(count)count.textContent=String(value.likeCount||'')};
  const inferEntity = node => {
    if (node.hasAttribute('data-social-disabled')) return;
    if (node.dataset.socialKind && node.dataset.socialId) return;
    if (node.dataset.calendarId) {
      node.dataset.socialKind='championship'; node.dataset.socialId=node.dataset.calendarId; return;
    }
    const replayControl=node.querySelector?.('[data-replay-id]');
    const directMatch=node.dataset.matchCard||node.dataset.liveCard||node.dataset.replayId||replayControl?.dataset.replayId;
    if (directMatch) { node.dataset.socialKind='match'; node.dataset.socialId=directMatch; return; }
    const link=node.querySelector?.('a[href*="progress.html?id="],a[href*="championship.html?id="],a[href*="registration-checkout.html?id="],a[href*="play.html?replay="],a[href*="play.html?match="],a[href*="play.html?join="]');
    if(!link)return;
    try{
      const url=new URL(link.href,location.href);
      const matchId=url.searchParams.get('replay')||url.searchParams.get('match')||url.searchParams.get('join');
      const championshipId=url.searchParams.get('id');
      if(matchId){node.dataset.socialKind='match';node.dataset.socialId=matchId}
      else if(championshipId){node.dataset.socialKind='championship';node.dataset.socialId=championshipId}
    }catch{}
  };
  const hydrateEntities=(root=document)=>{
    const selector='.hero-slide,.activity-card,.live-card,.calendar-feature,.calendar-timeline-item,.public-card,.activity-public-card,.match-card,.bracket-match,.recap-match,.champion-result,.champions-championship';
    if(root.matches?.(selector))inferEntity(root);
    root.querySelectorAll?.(selector).forEach(inferEntity);
  };
  const decorate=(root=document)=>{
    hydrateEntities(root);
    root.querySelectorAll?.('[data-social-kind][data-social-id]').forEach(node=>{
      const kind=node.dataset.socialKind;const id=node.dataset.socialId;if(!['match','championship'].includes(kind)||!/^[A-Za-z0-9_-]{1,150}$/.test(id)||node.querySelector('.entity-social-actions'))return;
      const actions=document.createElement('div');actions.className='entity-social-actions';actions.setAttribute('aria-label',ht()?'Aksyon sosyal':'Actions sociales');actions.innerHTML=`<button class="entity-social-button" type="button" data-entity-like aria-label="${escape(words().like)}" aria-pressed="false">${icon('heart')}<span class="entity-like-count"></span></button><button class="entity-social-button" type="button" data-entity-share aria-label="${escape(words().share)}">${icon('share')}</button>`;const slot=node.querySelector(':scope [data-social-actions-slot]');if(slot)slot.append(actions);else node.prepend(actions);updateNode(node);
    });
    scheduleRefresh();
  };
  const socialNodes=()=>[...document.querySelectorAll('[data-social-kind][data-social-id]')];
  const normalizeName=value=>String(value||'').trim().toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
  const hydratePlayerLinks=async()=>{
    if(!window.firebase?.firestore||!firebase.apps?.length)return;
    if(!playerProfilesLoaded){playerProfilesLoaded=true;try{const snapshot=await firebase.firestore().collection('socialProfiles').where('active','==',true).limit(500).get();snapshot.docs.forEach(doc=>{const data=doc.data()||{};const normalized=normalizeName(data.displayName);if(normalized&&!playerProfilesByName.has(normalized))playerProfilesByName.set(normalized,{id:doc.id,...data})})}catch(error){playerProfilesLoaded=false;console.warn('Social player directory unavailable:',error);return}}
    const profileLabel=profile=>`${words().share==='Pataje'?'Gade pwofil':'Voir le profil de'} ${profile.displayName}`;
    const wrapProfileElement=(element,profile)=>{if(!element||element.closest('a.player-social-link'))return;const link=document.createElement('a');link.className='player-social-link';link.href=`./player.html?id=${encodeURIComponent(profile.id)}`;link.setAttribute('aria-label',profileLabel(profile));element.parentNode.insertBefore(link,element);link.append(element)};
    const selectors=['.live-players .player b','.match-players>div>b','.public-versus>div>b','.bracket-player>strong','.recap-participant strong','.champion-name','.champion-result-copy h2','.ranking-table tbody tr td:nth-child(2) b','.community-message-meta strong'];
    document.querySelectorAll(selectors.join(',')).forEach(label=>{const profile=playerProfilesByName.get(normalizeName(label.textContent));if(!profile)return;const scope=label.closest('.live-card,.match-players>div,.public-versus>div,.bracket-player,.recap-participant,.champion-card,.champion-result,tr,.community-message');wrapProfileElement(label,profile);const avatar=scope?.querySelector('.ranking-avatar,.ranking-avatar-public,.recap-participant-avatar,.champion-profile-avatar,.community-avatar');wrapProfileElement(avatar,profile)});
  };
  const refresh=async()=>{
    const unique=[];const seen=new Set();socialNodes().forEach(node=>{const item={kind:node.dataset.socialKind,entityId:node.dataset.socialId};const itemKey=key(item.kind,item.entityId);if(!seen.has(itemKey)){seen.add(itemKey);unique.push(item)}});if(!unique.length)return;
    if(!(await ensureFunctions()))return;
    for(let offset=0;offset<unique.length;offset+=50){try{const batch=unique.slice(offset,offset+50);const result=await firebase.app().functions('us-central1').httpsCallable('getEntitySocialStates')({entities:batch});(result.data?.states||[]).forEach((item,index)=>{const requested=batch[index];document.querySelectorAll('[data-social-kind][data-social-id]').forEach(node=>{if(node.dataset.socialKind===requested?.kind&&node.dataset.socialId===requested?.entityId){node.dataset.socialKind=item.kind;node.dataset.socialId=item.entityId}});state.set(key(item.kind,item.entityId),item)})}catch(error){console.warn('Social state unavailable:',error)}}
    socialNodes().forEach(updateNode);hydratePlayerLinks();
  };
  function scheduleRefresh(){clearTimeout(refreshTimer);refreshTimer=setTimeout(refresh,120)}
  document.addEventListener('click',async event=>{
    const share=event.target.closest('[data-entity-share]');if(share){event.preventDefault();event.stopPropagation();const host=share.closest('[data-social-kind][data-social-id]');const title=host?.querySelector('h1,h2,h3,.live-game,.card-title')?.textContent?.trim()||'JWETPRO';openShare(host.dataset.socialKind,host.dataset.socialId,title,share);return}
    const like=event.target.closest('[data-entity-like]');if(!like)return;event.preventDefault();event.stopPropagation();const host=like.closest('[data-social-kind][data-social-id]');if(!(await ensureFunctions())||!firebase.auth().currentUser||firebase.auth().currentUser.isAnonymous){toast(words().login);setTimeout(()=>location.href='./index.html#login',650);return}const itemKey=key(host.dataset.socialKind,host.dataset.socialId);const previous=state.get(itemKey)||{liked:false,likeCount:0};const desired=!previous.liked;state.set(itemKey,{...previous,liked:desired,likeCount:Math.max(0,(previous.likeCount||0)+(desired?1:-1))});socialNodes().filter(node=>key(node.dataset.socialKind,node.dataset.socialId)===itemKey).forEach(updateNode);like.disabled=true;try{const result=await firebase.app().functions('us-central1').httpsCallable('setEntityLike')({kind:host.dataset.socialKind,entityId:host.dataset.socialId,liked:desired});const canonical=result.data;socialNodes().filter(node=>key(node.dataset.socialKind,node.dataset.socialId)===itemKey).forEach(node=>{node.dataset.socialKind=canonical.kind;node.dataset.socialId=canonical.entityId});state.delete(itemKey);state.set(key(canonical.kind,canonical.entityId),canonical);socialNodes().filter(node=>key(node.dataset.socialKind,node.dataset.socialId)===key(canonical.kind,canonical.entityId)).forEach(updateNode)}catch(error){state.set(itemKey,previous);socialNodes().filter(node=>key(node.dataset.socialKind,node.dataset.socialId)===itemKey).forEach(updateNode);toast(error?.message?.replace(/^Firebase:\s*/,'')||words().unavailable)}finally{like.disabled=false}
  });
  const observer=new MutationObserver(records=>{if(records.some(record=>[...record.addedNodes].some(node=>node.nodeType===1))){clearTimeout(refreshTimer);setTimeout(()=>decorate(document),80)}});
  observer.observe(document.body,{childList:true,subtree:true});
  window.JwetproSocial={decorate,refresh,openShare,state};decorate(document);
})();
