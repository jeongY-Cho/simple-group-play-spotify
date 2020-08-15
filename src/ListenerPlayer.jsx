import React from "react";
import * as auth from "./auth";
import axios from "axios";
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
  };

  changeIfChange = (uri) => {
    if (!uri) return Promise.resolve();
    const currentURI = this.state.uri;
    if (uri != currentURI) {
      return this.play(uri);
    }
    return Promise.resolve();
  };

  play = (uri, pos_ms) => {
    if (!this.state.device_id) return Promise.resolve();
    return axios.put(
      `https://api.spotify.com/v1/me/player/play?device_id=${this.state.device_id}`,
      {
        uris: [uri],
        position_ms: pos_ms,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${window.localStorage.getItem(
            "access_token"
          )}`,
        },
      }
    );
  };

  setListenerListeners = () => {
    this.props.socket.on("HOST_DISCONNECT", () => {
      this.player.pause();
    });

    this.props.socket.on("HOST_CONNECTED", (uri, position, playing) => {
      this.loadInitial(uri, position / 1000, playing);
      this.setState({
        hostConnected: true,
        position,
        uri,
        playing,
      });
    });

    this.props.socket.on("PLAY", (uri, position) => {
      this.changeIfChange(uri);
      clearInterval(this.tickInterval);
      this.tickInterval = setInterval(() => {
        this.setState({
          position: this.state.position + 1,
        });
      }, 1000);
      this.player.seek(position);
      this.player.resume();

      this.setState({
        hostConnected: true,
        uri,
        position: position / 1000,
      });
    });
    this.props.socket.on("PAUSE", (uri, position) => {
      clearInterval(this.tickInterval);
      this.changeIfChange(uri);
      this.player.seek(position);
      this.player.pause();
      this.setState({
        hostConnected: true,
        uri,
        position: position / 1000,
      });
    });
    this.props.socket.on("CHANGE", (uri) => {
      this.changeIfChange(uri);
      this.setState({
        uri,
        position: 0,
        playing: true,
      });
    });
    this.props.socket.on("SEEK", (uri, position, state) => {
      this.changeIfChange(uri).then(() => {
        if (state === "PLAY") {
          this.player.resume();
        } else {
          this.player.pause();
        }
        this.player.seek(position);
      });

      this.setState({
        hostConnected: true,
        uri,
        position: position / 1000,
        playing: state === "PLAY" ? true : false,
      });
    });
    this.props.socket.on("END", () => {
      this.setState({
        hostConnected: false,
      });
      this.player.disconnect();
    });

    this.player.addListener("player_state_changed", (data) => {
      if (data === null) return;
      const currentTrack = data.track_window.current_track;
      this.setState({
        duration: data.duration / 1000,
        coverArtURL: currentTrack.album.images[0].url,
        album: currentTrack.album.name,
        artists: currentTrack.artists,
        title: currentTrack.name,
      });
    });
  };

  connect = () => {
    console.log("once");
    this.player.addListener("ready", (e) => {
      console.log(e);
      this.setListenerListeners();

      this.setState(
        {
          connected: true,
          device_id: e.device_id,
        },
        () => {
          this.connectToPlayer().then(() => {
            this.props.socket.emit("INITIAL");
          });
        }
      );
    });
    this.player.on("player_state_changed", console.log);
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
    this.player.connect().then(console.log);
    console.log("connect");
    this.props.socket.on("INITIAL", (data) => {
      console.log("intial", data);
      if (data) {
        let stateObj = {
          uri: data.uri,
          position: (data.position + Date.now() - data.when) / 1000,
          playing: data.state === "PLAY" ? true : false,
          hostConnected: true,
        };
        this.loadInitial(data.uri, stateObj.position, stateObj.playing);
        this.setState(stateObj);
      } else {
        this.setState({
          hostConnected: false,
        });
      }
    });
  };

  componentWillUnmount() {
    if (this.player) {
      this.player.disconnect();
    }
  }

  componentDidMount() {
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
                auth.goAuth(this.props.sessionId);
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
          auth.goAuth(this.props.sessionId);
        }
      },
    });
    window.player = this.player;

    this.props.socket.on("CONNECTION_COUNT", console.log);
    window.socket = this.props.socket;
  }

  loadInitial(uri, seek, playing) {
    this.play(uri, seek * 1000).then(() => {
      console.log(uri, seek, playing);
      if (playing) {
        this.player.pause();
        this.player.togglePlay();
      } else {
        this.player.pause();
      }
    });
  }

  connectToPlayer = (device_id) => {
    return axios.put(
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
    );
  };

  startHosting = () => {
    this.connectToPlayer().then(() => {
      this.setState({
        hostConnected: true,
      });
    });
  };

  changeVolume = (e) => {
    this.player.setVolume(e.target.value);
    this.setState({
      volume: e.target.value,
    });
  };

  render() {
    if (!this.state.connected) {
      return <button onClick={this.connect}>Connect</button>;
    }

    if (!this.state.hostConnected) {
      return <div>waitingforhost</div>;
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
          You are listening to session {this.props.sessionId}. <br />
          Playback is controlled by the host. <br />
          Pressing pause will pause playback locally only. On resume, playback
          will resyncronize with the host.
        </div>
      </>
    );
  }
}
