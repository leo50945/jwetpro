const firebaseConfig={apiKey:'AIzaSyD_Hbkc00HfJDmtw-2KSR4b9AbsThFt8vg',authDomain:'mopyonlakay.firebaseapp.com',projectId:'mopyonlakay',storageBucket:'mopyonlakay.firebasestorage.app',messagingSenderId:'307157893690',appId:'1:307157893690:web:4e5a033d13d54ce86feb03'};
firebase.initializeApp(firebaseConfig);
const auth=firebase.auth(),db=firebase.firestore(),functions=firebase.app().functions('us-central1');
const championshipId=new URLSearchParams(location.search).get('id')||'';
const statusNode=document.getElementById('status'),loginForm=document.getElementById('login-form'),loaderBox=document.querySelector('.loader-box'),loaderTitle=document.getElementById('loader-title'),loaderCopy=document.getElementById('loader-copy'),spinner=document.querySelector('.spinner'),loaderBar=document.querySelector('.loader-bar');
let checkoutStarted=false;
const setStatus=(message,type='')=>{if(!message){statusNode.hidden=true;statusNode.textContent='';return;}statusNode.hidden=false;statusNode.textContent=message;statusNode.className=`status ${type}`.trim();};
const setLoading=on=>{spinner.hidden=!on;loaderBar.hidden=!on;loaderBox.classList.toggle('is-error',!on);};
async function ensureChampionship(){if(!championshipId)throw new Error('Championnat non précisé.');const snapshot=await db.collection('championships').doc(championshipId).get();if(!snapshot.exists)throw new Error('Championnat introuvable.');}
async function startCheckout(user){
  if(checkoutStarted||!user)return;
  checkoutStarted=true;
  loginForm.classList.add('hidden');
  setLoading(true);
  setStatus('');
  loaderTitle.textContent='Redirection vers le paiement sécurisé';
  loaderCopy.textContent='Veuillez patienter pendant que nous préparons votre inscription. Vous allez être redirigé vers Smart Cut pour finaliser votre paiement en toute sécurité.';
  try{
    const callable=functions.httpsCallable('createChampionshipRegistrationCheckout');
    const localHost=['localhost','127.0.0.1'].includes(location.hostname);
    const response=await callable({championshipId,returnBaseUrl:localHost?location.origin:''});
    const data=response.data||{};
    sessionStorage.setItem('jwetpro_last_ticket_intent',data.intentId||'');
    if(data.paidWithCredit){location.assign(data.returnUrl||`./registration-return.html?intent=${encodeURIComponent(data.intentId)}`);return;}
    if(!data.checkoutUrl)throw new Error('URL de paiement indisponible.');
    loaderCopy.textContent='Connexion sécurisée établie. Redirection vers Smart Cut et MonCash en cours...';
    location.assign(data.checkoutUrl);
  }catch(error){
    checkoutStarted=false;
    setLoading(false);
    loaderTitle.textContent='Redirection impossible pour le moment';
    loaderCopy.textContent='Nous n’avons pas pu ouvrir le paiement sécurisé. Merci de réessayer dans un instant.';
    const message=error?.message?.replace(/^Firebase:\s*/,'')||'Impossible de préparer le paiement.';
    setStatus(message,'error');
  }
}
loginForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const button=loginForm.querySelector('button');
  button.disabled=true;
  setStatus('Connexion en cours...');
  try{
    await auth.signInWithEmailAndPassword(document.getElementById('email').value.trim(),document.getElementById('password').value);
  }catch(error){
    setStatus(error.message||'Connexion impossible.','error');
    button.disabled=false;
  }
});
ensureChampionship().then(()=>auth.onAuthStateChanged(user=>{
  if(user){
    loginForm.classList.add('hidden');
    startCheckout(user);
  }else{
    setLoading(false);
    loaderTitle.textContent='Connectez-vous pour continuer';
    loaderCopy.textContent='Après connexion, la redirection vers le paiement sécurisé reprendra automatiquement.';
    loginForm.classList.remove('hidden');
    setStatus('');
  }
})).catch(error=>{
  setLoading(false);
  loaderTitle.textContent='Inscription indisponible';
  loaderCopy.textContent='Ce championnat n’est pas accessible au paiement pour le moment.';
  setStatus(error.message,'error');
});
