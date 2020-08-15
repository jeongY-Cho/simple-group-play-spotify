const CLIENT_ID = "f15b994280f345438a06222ca529dc94";
var TOKENS = {
  access_token: undefined,
  token_type: undefined,
  refresh_token: undefined,
  scope: undefined,
  refresh_token: undefined,
};
var CODE;

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has("code")) {
  CODE = urlParams.get("code");
  window.history.replaceState(
    {},
    document.title,
    window.location.href.replace(window.location.search, "")
  );
}

window.onSpotifyWebPlaybackSDKReady = () => {
  console.log("loaded");
  // You can now initialize Spotify.Player and use the SDK
};

async function getToken(code) {
  let postData = {
    client_id: CLIENT_ID,
    grant_type: "authorization_code",
    code: code,
    redirect_uri: "http://127.0.0.1:5500/frontend/index.html",
    code_verifier: window.sessionStorage.getItem("hashKey"),
  };
  let form = new URLSearchParams();
  for (let key in postData) {
    form.append(key, postData[key]);
  }

  let res = await axios.post("https://accounts.spotify.com/api/token", form);
  TOKENS = res.data;
  window.sessionStorage.setItem("refresh_token", res.data.refresh_token);
  window.sessionStorage.setItem(
    "expires_at",
    Date.now() + res.data.expires_in * 1000
  );
  window.sessionStorage.setItem("access_token", res.data.access_token);
  return res.data;
}

async function refreshToken(refreshToken) {
  let postData = {
    client_id: CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  };
  let form = new URLSearchParams();
  for (let key in postData) {
    form.append(key, postData[key]);
  }

  let res = await axios.post("https://accounts.spotify.com/api/token", form);
  TOKEN = res.data;
  return res.data;
}

async function goAuth() {
  let hash = await getVerifierAndChallenge(128);

  window.sessionStorage.setItem("hashKey", hash[0]);
  window.sessionStorage.setItem("hashResult", hash[1]);

  window.location.href = `https://accounts.spotify.com/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(
    "http://127.0.0.1:5500/frontend/index.html"
  )}&scope=streaming%20user-read-email%20user-read-private&code_challenge_method=S256&code_challenge=${
    hash[1]
  }`;
}

async function getVerifierAndChallenge(len) {
  const validChars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let array = new Uint8Array(len);
  window.crypto.getRandomValues(array);
  array = array.map((x) => validChars.charCodeAt(x % validChars.length));
  const randomState = String.fromCharCode.apply(null, array);
  const hashedState = await pkce_challenge_from_verifier(randomState);

  return [randomState, hashedState];
}
async function digestMessage(message) {
  const msgUint8 = new TextEncoder().encode(message); // encode as (utf-8) Uint8Array
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8); // hash the message
  const hashArray = Array.from(new Uint8Array(hashBuffer)); // convert buffer to byte array
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(""); // convert bytes to hex string
  return hashHex;
}

function sha256(plain) {
  // returns promise ArrayBuffer
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest("SHA-256", data);
}

function base64urlencode(a) {
  // Convert the ArrayBuffer to string using Uint8 array.
  // btoa takes chars from 0-255 and base64 encodes.
  // Then convert the base64 encoded to base64url encoded.
  // (replace + with -, replace / with _, trim trailing =)
  return btoa(String.fromCharCode.apply(null, new Uint8Array(a)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function pkce_challenge_from_verifier(v) {
  hashed = await sha256(v);
  base64encoded = base64urlencode(hashed);
  return base64encoded;
}
