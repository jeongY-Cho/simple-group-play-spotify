var player;
window.onSpotifyWebPlaybackSDKReady = () => {
  console.log("loaded");
  player = new Spotify.Player({
    name: "Michael Reeves's music",
    getOAuthToken: (callback) => {
      if (TOKENS.refresh_token) {
        return refreshToken(TOKENS.refresh_token);
      }

      if (CODE) {
        getToken(CODE).then((data) => {
          console.log(data);
          callback(data.access_token);
        });
      } else {
        return goAuth();
      }
    },
  });
};
