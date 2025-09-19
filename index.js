const { nowInSec, SkyWayAuthToken, SkyWayContext, SkyWayRoom, SkyWayStreamFactory, uuidV4 } = skyway_room;

(async () => {
  const localVideo = document.getElementById("local-video");
  const buttonArea = document.getElementById("button-area");
  const remoteVideoArea = document.getElementById("remote-video-area");
  const remoteAudioArea = document.getElementById("remote-audio-area");
  const roomNameInput = document.getElementById("room-name");

  const appIdInput = document.getElementById("app-id");
  const secretKeyInput = document.getElementById("secret-key");

  const myId = document.getElementById("my-id");
  const joinButton = document.getElementById("join");
  const localMuteButton = document.getElementById("mute");
  const leaveButton = document.getElementById("leave");
  leaveButton.disabled = true;
  let isMuted = false;

  /*** STEP 2. 自分自身の映像・音声を取得して描画 ***/
  const { audio, video } = await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream();
  video.attach(localVideo);
  await localVideo.play();

  // ボタンが押された時の処理
  joinButton.onclick = async () => {
    if (roomNameInput.value === "" || appIdInput.value === "" || secretKeyInput.value === "") {
      alert("App ID / Secret Key / Room 名を入力してください！");
      return;
    }

    localMuteButton.disabled = false;
    leaveButton.disabled = false;
    joinButton.disabled = true;

    /*** STEP 1. 認証・認可用のトークンを生成 ***/
    const token = new SkyWayAuthToken({
      jti: uuidV4(),
      iat: nowInSec(),
      exp: nowInSec() + 60 * 60 * 24,
      version: 3,
      scope: {
        appId: appIdInput.value,
        rooms: [
          {
            name: "*",
            methods: ["create", "close", "updateMetadata"],
            member: {
              name: "*",
              methods: ["publish", "subscribe", "updateMetadata"],
            },
          },
        ],
      },
    }).encode(secretKeyInput.value);

    /*** STEP 3. Context生成 ***/
    const context = await SkyWayContext.Create(token);

    /*** STEP 4. Roomの取得もしくは作成 ***/
    const room = await SkyWayRoom.FindOrCreate(context, {
      type: "p2p",
      name: roomNameInput.value,
    });

    /*** STEP 5. Roomに入室して自分のIDを表示 ***/
    const me = await room.join();
    myId.textContent = me.id;

    /*** STEP 6. 自分の映像・音声をpublish ***/
    const localAudioPublication = await me.publish(audio);
    const localVideoPublication = await me.publish(video);

    /*** STEP 7. 映像・音声をsubscribeして再生 ***/
    const subscribeAndAttach = (publication) => {
      if (publication.publisher.id === me.id) return;

      const subscribeButton = document.createElement("button");
      subscribeButton.id = `subscribe-button-${publication.id}`;
      subscribeButton.textContent = `${publication.publisher.id}: ${publication.contentType}`;
      buttonArea.appendChild(subscribeButton);

      subscribeButton.onclick = async () => {
        subscribeButton.disabled = true;

        const { stream } = await me.subscribe(publication.id);
        let remoteMedia;

        switch (stream.track.kind) {
          case "video":
            remoteMedia = document.createElement("video");
            remoteMedia.playsInline = true;
            remoteMedia.autoplay = true;
            stream.attach(remoteMedia);
            remoteMedia.id = `remote-media-${publication.id}`;
            publication.onDisabled.add(() => remoteMedia.load());
            remoteVideoArea.appendChild(remoteMedia);
            break;
          case "audio":
            remoteMedia = document.createElement("audio");
            remoteMedia.controls = true;
            remoteMedia.autoplay = true;
            stream.attach(remoteMedia);
            remoteMedia.id = `remote-media-${publication.id}`;
            remoteAudioArea.appendChild(remoteMedia);
            break;
        }
      };
    };

    room.publications.forEach(subscribeAndAttach);
    room.onStreamPublished.add((e) => subscribeAndAttach(e.publication));

    /*** STEP 8. 一時停止（Mute/Unmute） ***/
    localMuteButton.onclick = async () => {
      if (isMuted) {
        await localAudioPublication.enable();
        await localVideoPublication.enable();
        isMuted = false;
        localMuteButton.textContent = "映像・音声OFF";
      } else {
        await localAudioPublication.disable();
        await localVideoPublication.disable();
        isMuted = true;
        localMuteButton.textContent = "映像・音声ON";
      }
    };

    /*** STEP 9. 退出処理 ***/
    leaveButton.onclick = async () => {
      await me.leave();
      await room.dispose();

      myId.textContent = "";
      buttonArea.replaceChildren();
      remoteVideoArea.replaceChildren();
      remoteAudioArea.replaceChildren();

      leaveButton.disabled = true;
      localMuteButton.disabled = true;
      joinButton.disabled = false;
    };

    room.onStreamUnpublished.add((e) => {
      document.getElementById(`subscribe-button-${e.publication.id}`)?.remove();
      document.getElementById(`remote-media-${e.publication.id}`)?.remove();
    });
  };
})();
