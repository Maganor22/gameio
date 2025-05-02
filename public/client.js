// public/client.js

const socket           = io();
const userLabel        = document.getElementById('userLabel');
const lobbyListDiv     = document.getElementById('lobbyList');
const lobbyGrid        = lobbyListDiv.querySelector('.row');
const createLobbyBtn   = document.getElementById('createLobbyBtn');
const lobbyRoomDiv     = document.getElementById('lobbyRoom');
const hostPanel        = document.getElementById('hostPanel');
const roundsInput      = document.getElementById('roundsInput');
const difficultySelect = document.getElementById('difficultySelect');
const timeInput        = document.getElementById('timeInput');
const passwordInput    = document.getElementById('passwordInput');
const startBtn         = document.getElementById('startBtn');
const destroyBtn       = document.getElementById('destroyBtn');
const playersList      = document.getElementById('playersList');
const toastContainer   = document.getElementById('toastContainer');
const shareContainer   = document.getElementById('shareContainer');
const shareInput       = document.getElementById('shareInput');
const copyBtn          = document.getElementById('copyBtn');

// Modal for password
const passwordModalEl    = document.getElementById('passwordModal');
const passwordModal      = new bootstrap.Modal(passwordModalEl);
const passwordInputJoin  = document.getElementById('passwordInputJoin');
const passwordError      = document.getElementById('passwordError');
const passwordSubmitBtn  = document.getElementById('passwordSubmitBtn');
let pendingLobbyId       = null;

let amIHost    = false;
let codeParam  = new URLSearchParams(window.location.search).get('lobby');
let autoJoined = false;

function showToast(type, msg) {
  const el = document.createElement('div');
  el.className = `toast align-items-center text-bg-${type} border-0`;
  el.role      = 'alert';
  el.ariaLive  = 'assertive';
  el.ariaAtomic= 'true';
  el.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${msg}</div>
      <button type="button"
              class="btn-close btn-close-white me-2 m-auto"
              data-bs-dismiss="toast"
              aria-label="Close"></button>
    </div>`;
  toastContainer.appendChild(el);
  new bootstrap.Toast(el, { delay:3000 }).show();
  el.addEventListener('hidden.bs.toast', () => el.remove());
}

function showLobbyRoom() {
  lobbyListDiv.classList.add('d-none');
  lobbyRoomDiv.classList.remove('d-none');
}
function showLobbyList() {
  lobbyRoomDiv.classList.add('d-none');
  lobbyListDiv.classList.remove('d-none');
}

// Récupère l'user
fetch('/api/me').then(r=>r.json()).then(u=>userLabel.textContent = u.username);

// Création de lobby
createLobbyBtn.onclick = () => socket.emit('createLobby');

// Affiche la grille
socket.on('lobbyList', lobbies => {
  lobbyGrid.innerHTML = '';
  lobbies.forEach(l => {
    const col = document.createElement('div');
    col.className = 'col';
    col.innerHTML = `
      <div class="card text-dark h-100"
           data-id="${l.id}"
           data-code="${l.code}"
           data-haspass="${l.hasPassword}">
        <div class="card-body d-flex flex-column justify-content-center align-items-center">
          <h5 class="card-title">
            Lobby : ${l.code}${l.hasPassword?' 🔒':''}
          </h5>
          <p class="card-text">${l.playersCount} joueur(s)</p>
        </div>
      </div>`;
    const card = col.querySelector('.card');
    card.onclick = () => {
      const id = l.id;
      if (l.hasPassword) {
        // ouvre la modal
        pendingLobbyId = id;
        passwordError.classList.add('d-none');
        passwordInputJoin.value = '';
        passwordModal.show();
      } else {
        socket.emit('joinLobby', { lobbyId: id });
      }
    };
    lobbyGrid.appendChild(col);
  });

  // auto-join via URL
  if (codeParam && !autoJoined) {
    const found = lobbies.find(x => x.code === codeParam);
    if (found) {
      autoJoined = true;
      if (found.hasPassword) {
        pendingLobbyId = found.id;
        passwordError.classList.add('d-none');
        passwordInputJoin.value = '';
        passwordModal.show();
      } else {
        socket.emit('joinLobby', { lobbyId: found.id });
      }
      showToast('info', `Tentative de rejoindre ${codeParam}…`);
    }
  }
});

// Lorsque le host ou invité rejoint
socket.on('lobbyJoined', payload => {
  // cache la modal si ouverte
  passwordModal.hide();
  history.replaceState(null, '', `?lobby=${payload.code}`);
  updateUI(payload);
  showToast('success', `Bienvenue dans ${payload.code}`);
});

// Erreurs
socket.on('errorMessage', msg => {
  // si la modal est ouverte, affiche l'erreur dedans
  if (passwordModalEl.classList.contains('show')) {
    passwordError.textContent = msg;
    passwordError.classList.remove('d-none');
  } else {
    showToast('warning', msg);
  }
});

// Met à jour l’UI
socket.on('lobbyUpdated', updateUI);
socket.on('playerJoined', name => showToast('success', `${name} a rejoint le lobby.`));
socket.on('playerLeft',   name => showToast('info',    `${name} a quitté le lobby.`));
socket.on('kicked',       msg  => { showToast('danger', msg); showLobbyList(); });
socket.on('lobbyDestroyed',() => { showToast('info', 'Le lobby a été détruit.'); showLobbyList(); });

function updateUI({ players, settings, hostId, code, isHost }) {
  amIHost = isHost;
  showLobbyRoom();

  // settings
  roundsInput.value      = settings.rounds;
  difficultySelect.value = settings.difficulty;
  timeInput.value        = settings.timePerQuestion;
  passwordInput.value    = settings.password || '';

  hostPanel.querySelectorAll('input,select')
           .forEach(el => el.disabled = !isHost);
  startBtn.style.display   = isHost ? 'block' : 'none';
  destroyBtn.style.display = isHost ? 'block' : 'none';

  // partage
  shareInput.value     = `${window.location.origin}/?lobby=${code}`;
  shareContainer.classList.remove('d-none');

  // liste joueurs
  playersList.innerHTML = '';
  players.forEach(p => {
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex align-items-center';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = p.name + (p.userId===hostId?' (Hôte)':'');
    li.appendChild(nameSpan);

    if (isHost && p.id!==socket.id) {
      const btnGroup = document.createElement('div');
      btnGroup.className = 'ms-auto d-flex gap-2';

      const kickBtn = document.createElement('button');
      kickBtn.className = 'btn btn-sm btn-danger';
      kickBtn.textContent = 'Kick';
      kickBtn.onclick = () => socket.emit('kickPlayer', p.id);
      btnGroup.appendChild(kickBtn);

      const banBtn = document.createElement('button');
      banBtn.className = 'btn btn-sm btn-warning';
      banBtn.textContent = 'Ban';
      banBtn.onclick = () => socket.emit('banPlayer', p.id);
      btnGroup.appendChild(banBtn);

      li.appendChild(btnGroup);
    }
    playersList.appendChild(li);
  });
}

// copy link
copyBtn.onclick = () => {
  navigator.clipboard.writeText(shareInput.value)
    .then(() => showToast('success','Lien copié !'));
};

// Modal submit mot de passe
passwordSubmitBtn.onclick = () => {
  const pwd = passwordInputJoin.value;
  socket.emit('joinLobby', { lobbyId: pendingLobbyId, password: pwd });
};

// update settings
function onSettingChange() {
  if (!amIHost) return;
  socket.emit('updateSettings', {
    rounds:          +roundsInput.value,
    difficulty:       difficultySelect.value,
    timePerQuestion: +timeInput.value,
    password:         passwordInput.value.trim()
  });
}
[roundsInput, difficultySelect, timeInput, passwordInput]
  .forEach(el => el.addEventListener('change', onSettingChange));

// start / destroy
startBtn.onclick   = () => socket.emit('startQuiz');
destroyBtn.onclick = () => socket.emit('destroyLobby');

// demande la liste initiale
socket.emit('getLobbyList');
