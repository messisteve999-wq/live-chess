import { Chess } from "https://cdn.jsdelivr.net/npm/chess.js@1.4.0/dist/esm/chess.js";
(() => {
  const $ = id => document.getElementById(id);
  const socket = io();
  let token = localStorage.getItem("liveChessToken") || ""; let lastRoomPly=0;
  let mode = "register", user = null, currentPage = "home", roomCode = "", myColor = "w", selected = null, legalTargets = [], game = null, aiMode = false, flipped = false;
  const pieceGlyph = {w:{k:"♔",q:"♕",r:"♖",b:"♗",n:"♘",p:"♙"},b:{k:"♚",q:"♛",r:"♜",b:"♝",n:"♞",p:"♟"}};
  // Musique d'ambiance et sons de coups générés localement avec Web Audio.
  const audio = {ctx:null,musicGain:null,sfxGain:null,musicTimer:null,musicIndex:0,musicMuted:false,sfxMuted:false,musicVolume:.35,sfxVolume:.7,style:"classique"};
  const melodies={classique:[261.63,329.63,392,329.63,293.66,349.23,440,349.23],epique:[196,246.94,293.66,392,349.23,293.66,246.94,329.63],calme:[220,261.63,329.63,392,329.63,261.63],electronique:[130.81,196,261.63,196,146.83,220,293.66,220],jazz:[293.66,349.23,415.3,493.88,440,349.23,311.13,392]};
  function initAudio(){if(audio.ctx)return;try{audio.ctx=new (window.AudioContext||window.webkitAudioContext)();audio.musicGain=audio.ctx.createGain();audio.sfxGain=audio.ctx.createGain();audio.musicGain.connect(audio.ctx.destination);audio.sfxGain.connect(audio.ctx.destination);applyAudioVolumes();}catch{}}
  function tone(freq,duration,kind="sfx",wave="sine"){initAudio();if(!audio.ctx)return;audio.ctx.resume?.();const osc=audio.ctx.createOscillator(),gain=audio.ctx.createGain();osc.type=wave;osc.frequency.value=freq;gain.gain.setValueAtTime(.0001,audio.ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.13,audio.ctx.currentTime+.025);gain.gain.exponentialRampToValueAtTime(.0001,audio.ctx.currentTime+duration);osc.connect(gain);gain.connect(kind==="music"?audio.musicGain:audio.sfxGain);osc.start();osc.stop(audio.ctx.currentTime+duration+.03);}
  function applyAudioVolumes(){if(audio.musicGain)audio.musicGain.gain.value=audio.musicMuted?0:audio.musicVolume*.26;if(audio.sfxGain)audio.sfxGain.gain.value=audio.sfxMuted?0:audio.sfxVolume*.55;}
  function musicTick(){if(audio.musicMuted||audio.musicVolume<=0)return;const list=melodies[audio.style]||melodies.classique;const f=list[audio.musicIndex++%list.length];tone(f,1.15,"music",audio.style==="electronique"?"triangle":"sine");if(audio.musicIndex%4===0)tone(f/2,1.6,"music","sine");}
  function startMusic(){initAudio();if(!audio.ctx||audio.musicTimer)return;musicTick();audio.musicTimer=setInterval(musicTick,1250);}
  function playMoveSound(move){if(audio.sfxMuted||audio.sfxVolume<=0)return;const piece=move?.piece||"p",capture=!!move?.captured;const notes={p:620,n:740,b:820,r:520,q:440,k:360};tone(capture?210:(notes[piece]||620),capture?.22:.11,"sfx",capture?"triangle":"sine");if(capture)tone(155,.16,"sfx","triangle");}
  function bindAudio(){const mv=$("music-volume"),sv=$("sfx-volume");mv.oninput=()=>{audio.musicVolume=Number(mv.value)/100;$("music-volume-label").textContent=mv.value+"%";applyAudioVolumes();startMusic();};sv.oninput=()=>{audio.sfxVolume=Number(sv.value)/100;$("sfx-volume-label").textContent=sv.value+"%";applyAudioVolumes();initAudio();};$("music-mute").onclick=()=>{audio.musicMuted=!audio.musicMuted;$("music-mute").innerHTML="♫ Couper la musique : <b>"+(audio.musicMuted?"OUI":"NON")+"</b>";applyAudioVolumes();if(!audio.musicMuted)startMusic();};$("sfx-mute").onclick=()=>{audio.sfxMuted=!audio.sfxMuted;$("sfx-mute").innerHTML="♬ Couper le song : <b>"+(audio.sfxMuted?"OUI":"NON")+"</b>";applyAudioVolumes();};$("music-style").onchange=()=>{audio.style=$("music-style").value;audio.musicIndex=0;if(audio.musicTimer){clearInterval(audio.musicTimer);audio.musicTimer=null;}startMusic();};$("audio-toggle").onclick=()=>{const el=$("audio-settings");el.hidden=!el.hidden;$("audio-toggle").textContent=el.hidden?"Afficher":"Masquer";};$("game-audio").onclick=()=>{goPage("home");$("audio-settings").hidden=false;$("audio-toggle").textContent="Masquer";window.scrollTo({top:0,behavior:"smooth"});};}
  bindAudio();

  const files = "abcdefgh";
  const show = (id, yes) => $(id).hidden = !yes;
  const authHeader = () => ({ "Content-Type":"application/json", "Authorization":"Bearer "+token });
  async function api(url, body) {
    const r = await fetch(url, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)});
    const d = await r.json(); if(!r.ok) throw Error(d.error || "Erreur"); return d;
  }
  function setMode(next) { mode=next; $("tab-register").classList.toggle("active",mode==="register"); $("tab-login").classList.toggle("active",mode==="login"); $("auth-submit").textContent=mode==="register"?"Créer mon compte":"Se connecter"; $("password").autocomplete=mode==="register"?"new-password":"current-password"; $("auth-error").textContent=""; }
  $("tab-register").onclick=()=>setMode("register"); $("tab-login").onclick=()=>setMode("login");
  $("auth-form").onsubmit=async e=>{
    e.preventDefault(); $("auth-error").textContent=""; $("auth-submit").disabled=true;
    try { const d=await api(mode==="register"?"/api/register":"/api/login",{username:$("username").value,password:$("password").value}); token=d.token;user=d.user;localStorage.setItem("liveChessToken",token);enterHome(); }
    catch(err){$("auth-error").textContent=err.message;}
    finally{$("auth-submit").disabled=false;}
  };
  async function refreshUser(){const r=await fetch("/api/me",{headers:{"Authorization":"Bearer "+token}});if(!r.ok)throw Error("session");user=(await r.json()).user;}
  function enterHome(){startMusic();show("auth",false);show("home",true);show("bottom-nav",true);$("hello").textContent=user.username;$("points").textContent=user.points;$("wins").textContent=user.wins;$("losses").textContent=user.losses;goPage("home");}
  function goPage(page){currentPage=page;["friends","ai","tournament","game"].forEach(p=>show(p,false));if(page==="home"){show("game",false);return;}show(page,true);if(page!=="game")show("game",false);document.querySelectorAll(".bottom-nav button").forEach(b=>b.classList.toggle("active",b.dataset.page===page));}
  document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>goPage(b.dataset.page));
  document.querySelectorAll(".back").forEach(b=>b.onclick=()=>{aiMode=false;goPage("home");});
  $("create-room").onclick=()=>socket.emit("room:create",{token},res=>{if(res.error)return msg(res.error);roomCode=res.code;aiMode=false;myColor="w";$("room-code").value=roomCode;$("room-message").textContent="Salon créé : "+roomCode+". Partage ce code avec ton ami.";show("share-room",true);startGamePage();});
  $("join-room").onclick=()=>socket.emit("room:join",{token,code:$("room-code").value},res=>{if(res.error)return msg(res.error);roomCode=res.code;aiMode=false;const me=res.state.players.find(p=>p.username===user.username);myColor=me?me.color:"b";show("share-room",false);startGamePage();});
  $("share-room").onclick=()=>share("Rejoins ma partie live-chess avec le code "+roomCode);
  $("share-app").onclick=()=>share("Rejoins live-chess : "+location.origin);
  async function share(text){try{if(navigator.share)await navigator.share({title:"live-chess",text,url:location.href});else{await navigator.clipboard.writeText(text);alert("Invitation copiée.");}}catch{}}
  function msg(t){$("room-message").textContent=t;}
  function startGamePage(){goPage("game");startMusic();$("white-player").textContent=user?.username||"Blancs";$("black-player").textContent=aiMode?"IA — Niveau 1":"Adversaire";$("white-points").textContent=user?.points??200;$("black-points").textContent="200";$("game-title").textContent=aiMode?"Entraînement contre IA":"Partie en ligne";$("game-subtitle").textContent=roomCode?"Code du salon : "+roomCode:"Partie locale";$("game-message").textContent="Blancs jouent en premier.";if(!game)game=new Chess();renderBoard();}
  socket.on("connect",()=>{$("online").textContent="En ligne";$("online").style.color="var(--green)";});
  socket.on("disconnect",()=>{$("online").textContent="Hors ligne";$("online").style.color="#ff9aa9";});
  socket.on("room:update",state=>{if(state.code!==roomCode)return;const oldPly=lastRoomPly;game=new Chess(state.fen);lastRoomPly=game.history().length;if(lastRoomPly>oldPly && oldPly>=0)playMoveSound({piece:"p"});const wp=state.players.find(p=>p.color==="w"),bp=state.players.find(p=>p.color==="b");$("white-player").textContent=wp?.username||"En attente…";$("black-player").textContent=bp?.username||"En attente d’un adversaire";$("game-subtitle").textContent=state.players.map(p=>p.username+" ("+(p.color==="w"?"Blancs":"Noirs")+")").join(" · ")+(state.players.length<2?" · En attente d'un adversaire":"");$("game-message").textContent=state.status+" — "+(state.turn==="w"?"Aux blancs de jouer":"Aux noirs de jouer");selected=null;renderBoard();});
  socket.on("game:finished",d=>{$("game-message").textContent=d.winner?"Vainqueur : "+d.winner:d.reason;});
  socket.on("player:disconnected",d=>{$("game-message").textContent=d.username+" s'est déconnecté. Attends son retour.";});
  function renderBoard(){if(!game)return;const board=$("board");board.innerHTML="";const b=game.board();for(let ri=0;ri<8;ri++)for(let ci=0;ci<8;ci++){let r=flipped?7-ri:ri,c=flipped?7-ci:ci;const sq=files[c]+(8-r),piece=b[r][c];const btn=document.createElement("button");btn.className="square "+((r+c)%2===0?"light":"dark");btn.dataset.square=sq;if(selected===sq)btn.classList.add("selected");if(legalTargets.includes(sq))btn.classList.add("target");if(piece)btn.classList.add("occupied");btn.innerHTML=(piece?pieceGlyph[piece.color][piece.type]:"")+(c===0?'<span class="coord">'+(8-r)+'</span>':"");btn.onclick=()=>clickSquare(sq);board.appendChild(btn);}const history=game.history();$("moves").textContent=history.length?"Coups : "+history.join(" · "):"Aucun coup joué.";}
  function clickSquare(sq){if(!game||game.isGameOver())return;const piece=game.get(sq);if(selected&&legalTargets.includes(sq)){makeMove(selected,sq);return;}if(piece&&piece.color===game.turn()){selected=sq;legalTargets=game.moves({square:sq,verbose:true}).map(m=>m.to);renderBoard();return;}selected=null;legalTargets=[];renderBoard();}
  function makeMove(from,to){if(aiMode){let played;try{played=game.move({from,to,promotion:"q"});}catch{return;}playMoveSound(played);selected=null;legalTargets=[];renderBoard();if(game.isGameOver())return;$("game-message").textContent="L'IA réfléchit…";setTimeout(()=>{const moves=game.moves({verbose:true});if(!moves.length)return;const m=moves[Math.floor(Math.random()*moves.length)];const played=game.move(m);playMoveSound(played);renderBoard();$("game-message").textContent=game.isGameOver()?"Partie terminée": "À toi de jouer.";},450);return;}
    socket.emit("game:move",{token,code:roomCode,from,to,promotion:"q"},res=>{if(res.error)$("game-message").textContent=res.error;});selected=null;legalTargets=[];renderBoard();}
  $("start-ai").onclick=()=>{aiMode=true;roomCode="";game=new Chess();myColor="w";startGamePage();};
  $("flip").onclick=()=>{flipped=!flipped;renderBoard();};
  $("copy-code").onclick=async()=>{try{await navigator.clipboard.writeText(roomCode);$("game-message").textContent="Code copié : "+roomCode;}catch{$("game-message").textContent="Code du salon : "+roomCode;}};
  $("resign").onclick=()=>{if(confirm("Quitter cette partie ?")){game=null;roomCode="";aiMode=false;goPage("home");}};
  (async()=>{if(token){try{await refreshUser();enterHome();}catch{token="";localStorage.removeItem("liveChessToken");}}if(!user)show("auth",true);})();
  if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));
})();