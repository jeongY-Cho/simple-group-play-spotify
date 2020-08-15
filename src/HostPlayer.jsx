import React from "react";
import * as auth from "./auth";
import axios from "axios";
import { io } from "./App";
import { Player } from "./Player";

export default class HostPlayer extends React.Component {
  state = {
    position: 0,
    duration: 0,
    connected: false,
    uri: "",
    playing: false,
    coverArtURL: "",
    title: "",
    artists: [],
    album: "",
    device_id: "",
    volume: 0.2,
    hostConnected: false,
    viewPlayer: false,
    psoCounter: 0,
  };

  setHostEmitters = () => {
    axios.get("/refresh");
    this.refreshInterval = setInterval(() => {
      axios.get("/refresh");
    }, 30 * 60 * 1000);
  };
  connect = () => {
    console.log("once");
    this.player.addListener("ready", (e) => {
      console.log(e);
      this.connectToPlayer(e.device_id);
      this.setHostEmitters();

      this.setState(
        {
          device_id: e.device_id,
        },
        () => {}
      );
    });
    this.player.addListener("not_ready", console.log);
    this.player.on("initialization_error", ({ message }) => {
      console.error("Failed to initialize", message);
    });
    this.player.on("authentication_error", ({ message }) => {
      console.error("Failed to authenticate", message);
    });
    this.player.on("account_error", ({ message }) => {
      console.error("Failed to validate Spotify account", message);
    });
    this.player.on("playback_error", ({ message }) => {
      console.error("Failed to perform playback", message);
    });
    this.player.connect();
  };

  initializePlayer = () => {
    window.spotifyReady = "in";
    console.log("playback ready");
    this.player = new window.Spotify.Player({
      volume: 0.2,
      name: "Michael Reeves player",
      getOAuthToken: (callback) => {
        let token = window.localStorage.getItem("access_token");
        let refreshToken = window.localStorage.getItem("refresh_token");
        let expire = window.localStorage.getItem("expires_at");
        if (Date.now() > expire && refreshToken) {
          return auth
            .refreshToken(refreshToken)
            .then((data) => {
              callback(data.access_token);
            })
            .catch((e) => {
              if ((e.error_description = "Refresh Token Revoked")) {
                window.localStorage.removeItem("refresh_token");
                window.localStorage.removeItem("access_token");
                auth.goAuth(this.props.match.params.id);
              }
            });
        }

        if (token) {
          return callback(token);
        }
        let code = window.localStorage.getItem("code");
        if (code) {
          auth.getToken(code).then((data) => {
            window.localStorage.removeItem("code");
            console.log(data);
            callback(data.access_token);
          });
        } else {
          auth.goAuth(this.props.match.params.id);
        }
      },
    });
    this.player.on("player_state_changed", (data) => {
      console.log(data);
      if (data) {
        console.log("alksdfe", data);
        this.setState({
          playbackStateObj: data,
          position: data.position,
          psoCounter: this.state.psoCounter + 1,
        });
      }
    });
  };

  componentDidMount() {
    if (window.spotifyReady) {
      this.initializePlayer();
    } else {
      window.onSpotifyWebPlaybackSDKReady = this.initializePlayer;
    }
  }

  componentDidUpdate(
    _prevProps,
    { playbackStateObj: pPSO, psoCounter: ppsoC }
  ) {
    if (this.state.psoCounter == 1) {
      let {
        track_window: {
          current_track: { uri },
        },
        position,
        paused,
      } = this.state.playbackStateObj;
      console.log(uri);
      this.props.socket.emit("HOST_CONNECTED", uri, position, !paused);
    } else if (ppsoC != this.state.psoCounter) {
      let {
        track_window: {
          current_track: { uri },
        },
        position,
        paused,
      } = this.state.playbackStateObj;
      if (pPSO.paused != paused) {
        this.props.socket.emit("UPDATE", uri, position, !paused);

        if (paused) {
          clearInterval(this.tickInterval);
        } else {
          this.tickInterval = setInterval(() => {
            this.setState({
              position: this.state.position + 1000,
            });
          }, 1000);
        }
      }
    }
  }

  componentWillUnmount() {
    this.player.removeListener("ready");
    this.props.socket.disconnect();
    this.player.disconnect();
    delete window.player;
  }

  connectToPlayer = (device_id) => {
    return axios
      .put(
        `https://api.spotify.com/v1/me/player`,
        {
          device_ids: [device_id || this.state.device_id],
          play: false,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${window.localStorage.getItem(
              "access_token"
            )}`,
          },
        }
      )
      .then(() => {
        this.setState({
          connected: true,
        });
      });
  };

  changeVolume = (e) => {
    this.player.setVolume(e.target.value);
  };

  render() {
    if (!this.state.playbackStateObj) {
      return <button onClick={this.connect}>Connect</button>;
    }

    let { paused, duration, volume } = this.state.playbackStateObj;
    let position = this.state.position;
    let coverArtURL = this.state.playbackStateObj.track_window.current_track
      .album.images[0].url;
    let album = this.state.playbackStateObj.track_window.current_track.album
      .name;
    let artists = this.state.playbackStateObj.track_window.current_track
      .artists;
    let title = this.state.playbackStateObj.track_window.current_track.name;

    return (
      <>
        <Player
          position={position / 1000}
          duration={duration / 1000}
          coverArtURL={coverArtURL}
          album={album}
          title={title}
          artists={artists}
          playing={!paused}
          volume={volume}
          changeVolume={this.changeVolume}
        />
        <div
          style={{
            width: 300,
            textAlign: "center",
            backgroundColor: "#424242",
            borderRadius: 10,
            padding: 30,
            marginTop: 10,
          }}
        >
          You are Hosting Session {this.props.match.params.id} <br />
          Use Spotify as you usually would.
        </div>
      </>
    );
  }
}
