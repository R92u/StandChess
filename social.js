import * as fb from './vendor/firebase.min.js';

const configResponse = await fetch(
  new URL('./assets/firebase.json', import.meta.url),
);
if (!configResponse.ok) throw Error('Не удалось загрузить настройки аккаунта.');
const config = await configResponse.json();
const app = fb.initializeApp(config);
const auth = fb.getAuth(app);
const db = fb.getFirestore(app);
const provider = new fb.GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });
export const embedded = /StandChess(Android|IOS)|StandChess\/iOS/i.test(
  navigator.userAgent,
);
export const browserLogin = () => fb.signInWithPopup(auth, provider);
export const logout = () => fb.signOut(auth);
const profiles = new Map();
let close = [],
  generation = 0;
export const state = {
  user: null,
  nick: '',
  friends: [],
  duels: [],
  ready: false,
};
const notify = () => window.dispatchEvent(new Event('stand-social-change'));
function socialError(error) {
  window.dispatchEvent(
    new CustomEvent('stand-social-error', { detail: error }),
  );
}
export function start() {
  fb.onAuthStateChanged(
    auth,
    async (user) => {
      const current = ++generation;
      close.splice(0).forEach((fn) => fn());
      Object.assign(state, {
        user,
        nick: '',
        friends: [],
        duels: [],
        ready: !user,
      });
      notify();
      if (!user) return;
      try {
        const unsubscribe = fb.onSnapshot(
          fb.doc(db, 'profiles', user.uid),
          (snap) => {
            state.nick = snap.data()?.nick || '';
            state.ready = true;
            notify();
          },
          socialError,
        );
        close.push(unsubscribe);
        for (const name of ['friends', 'duels']) {
          const sides = { from: [], to: [] };
          for (const side of ['from', 'to']) {
            const q = fb.query(
              fb.collection(db, name),
              fb.where(side, '==', user.uid),
            );
            close.push(
              fb.onSnapshot(
                q,
                (snapshot) => {
                  if (current !== generation) return;
                  sides[side] = snapshot.docs.map((d) => ({
                    id: d.id,
                    ...d.data(),
                  }));
                  state[name] = [...sides.from, ...sides.to];
                  notify();
                  for (const row of sides[side])
                    loadNick(row.from === user.uid ? row.to : row.from);
                },
                socialError,
              ),
            );
          }
        }
      } catch (e) {
        socialError(e);
      }
    },
    socialError,
  );
}
async function loadNick(id) {
  if (profiles.has(id)) return;
  profiles.set(id, null);
  try {
    const record = await fb.getDoc(fb.doc(db, 'profiles', id));
    profiles.set(id, record.data()?.nick || 'Игрок');
    notify();
  } catch {
    profiles.delete(id);
  }
}
export const nickOf = (id) => profiles.get(id) || 'Игрок';
const validNick = /^[a-zA-Zа-яА-ЯёЁ0-9_]{3,20}$/u;
export async function chooseNick(value) {
  const nick = value.trim();
  if (!validNick.test(nick))
    throw Error('Введите от 3 до 20 букв, цифр или знаков подчёркивания.');
  const uid = auth.currentUser.uid;
  const handle = fb.doc(db, 'handles', nick.toLowerCase());
  await fb.runTransaction(db, async (tx) => {
    if ((await tx.get(handle)).exists()) throw Error('Этот ник уже занят.');
    tx.set(handle, { uid });
    tx.set(fb.doc(db, 'profiles', uid), { nick, key: nick.toLowerCase() });
  });
}
export async function addFriend(value) {
  const nick = value.trim().toLowerCase();
  if (!validNick.test(nick)) throw Error('Введите точный ник друга.');
  const to = (await fb.getDoc(fb.doc(db, 'handles', nick))).data()?.uid;
  const from = auth.currentUser.uid;
  if (!to) throw Error('Игрок с таким ником не найден.');
  if (to === from) throw Error('Это ваш ник.');
  if (state.friends.some((r) => r.from === to || r.to === to))
    throw Error('С этим игроком уже есть дружба или заявка.');
  await fb.setDoc(fb.doc(db, 'friends', from + '~' + to), {
    from,
    to,
    status: 'pending',
  });
}
export const acceptFriend = (id) =>
  fb.updateDoc(fb.doc(db, 'friends', id), { status: 'friends' });
export const dismiss = (group, id) => fb.deleteDoc(fb.doc(db, group, id));
export async function challenge(to, hostStand) {
  const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  await fb.setDoc(fb.doc(db, 'duels', id), {
    from: auth.currentUser.uid,
    to,
    status: 'pending',
    hostStand,
    created: fb.serverTimestamp(),
  });
}
export async function acceptDuel(id, guestStand) {
  const response = await fetch(
    window.StandRoom.backend + '/api/duels/instance',
    { cache: 'no-store', signal: AbortSignal.timeout(90000) },
  );
  if (!response.ok) throw Error('Сервер игры недоступен. Попробуйте ещё раз.');
  const { instance } = await response.json();
  await fb.updateDoc(fb.doc(db, 'duels', id), {
    status: 'accepted',
    guestStand,
    instance,
    accepted: fb.serverTimestamp(),
  });
}
export const token = () => auth.currentUser.getIdToken();
async function transfer(path, body) {
  const base =
    location.hostname === 'r92u.github.io'
      ? 'https://standchess-r92u.onrender.com'
      : location.origin;
  const res = await fetch(base + '/api/account/' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const result = await res.json();
  if (!res.ok) throw Error(result.error || 'Не удалось подтвердить вход.');
  return result;
}
export async function makeLoginCode() {
  const result = await browserLogin();
  const googleToken =
    fb.GoogleAuthProvider.credentialFromResult(result)?.idToken;
  if (!googleToken) throw Error('Google не вернул подтверждение входа.');
  return (await transfer('transfer', { googleToken })).code;
}
export async function redeemLoginCode(code) {
  const normalized = code.trim().replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-F0-9]{32}$/.test(normalized)) throw Error('Вставьте код целиком.');
  const { googleToken } = await transfer('redeem', { code: normalized });
  return fb.signInWithCredential(
    auth,
    fb.GoogleAuthProvider.credential(googleToken),
  );
}
