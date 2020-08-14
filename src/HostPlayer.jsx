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
  };

  setHostEmitters = () => {
    axios.get("/refresh");
    this.refreshInterval = setInterval(() => {
      axios.get("/refresh");
    }, 30 * 60 * 1000);
    let connectedMessage = false;
    this.player.addListener("player_state_changed", (data) => {
      if (!connectedMessage) {
        this.props.socket.emit(
          "HOST_CONNECTED",
          data.uri,
          data.position,
          !data.paused
        );
        connectedMessage = true;
      }
      if (data === null) return;
      const uri = data.track_window.current_track.uri;
      let retObj = {};
      if (data.uri != this.state.uri) {
        this.props.socket.emit("CHANGE", uri);
        retObj.uri = uri;
      }

      clearInterval(this.tickInterval);

      if (!data.paused) {
        this.tickInterval = setInterval(() => {
          this.setState({
            position: this.state.position + 1,
          });
        }, 1000);
        retObj.playing = true;
      } else {
        retObj.playing = false;
      }
      retObj.position = data.position / 1000;
      retObj.duration = data.duration / 1000;

      if (this.state.playing != retObj.playing) {
        if (retObj.playing) {
          this.props.socket.emit("PLAY", uri, data.position);
        } else {
          this.props.socket.emit("PAUSE", uri, data.position);
        }
      } else {
        this.props.socket.emit("SEEK", uri, data.position);
      }
      const currentTrack = data.track_window.current_track;

      retObj.coverArtURL = currentTrack.album.images[0].url;
      retObj.album = currentTrack.album.name;
      retObj.artists = currentTrack.artists;
      retObj.title = currentTrack.name;
      retObj.stateObj = data;

      this.setState(retObj);
      console.log(data);
    });
  };

  sendConnected = () => {};

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
    window.player = this.player;

    window.socket = this.props.socket;
  };

  componentDidMount() {
    if (window.spotifyReady) {
      this.initializePlayer();
    } else {
      window.onSpotifyWebPlaybackSDKReady = this.initializePlayer;
    }
  }

  componentWillUnmount() {
    this.player.removeListener("ready");
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
    this.setState({
      volume: e.target.value,
    });
  };

  toggleView = () => {
    this.setState({
      isHost: !this.state.isHost,
    });
  };
  render() {
    if (!this.state.connected) {
      return <button onClick={this.connect}>Connect</button>;
    }

    return (
      <>
        <Player
          position={this.state.position}
          duration={this.state.duration}
          coverArtURL={this.state.coverArtURL}
          album={this.state.album}
          title={this.state.title}
          artists={this.state.artists}
          playing={this.state.playing}
          volume={this.state.volume}
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
