document.addEventListener("DOMContentLoaded", () => {
  const appState = {
    songs: [],
    albums: [],
    currentSong: null,
    playQueue: [],
    currentSongIndexInQueue: -1,
    lyrics: [],
    currentLyricIndex: -1,
    isPlaying: false,
    currentSource: "",
    currentView: "library",
    preferredSource: null,
    currentMode: "normal",
    shareSelection: [],
    cachedPlaylists: {},
    editingPlaylistId: null,
  };
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const CACHE_KEY = "atmosPlayerState_v2";
  const MAX_COVER_SIZE_BYTES = 1 * 1024 * 1024;
  const fullscreenRippleContainer = document.getElementById(
    "fullscreen-ripple-container",
  );
  const appMain = document.getElementById("app-main");
  const audioPlayer = document.getElementById("audio-player");
  const searchInput = document.getElementById("search-input");
  const libraryView = document.getElementById("library-view");
  const songDetailView = document.getElementById("song-detail-view");
  const albumDetailView = document.getElementById("album-detail-view");
  const playlistDetailView = document.getElementById("playlist-detail-view");
  const searchView = document.getElementById("search-view");
  const miniPlayer = document.getElementById("mini-player");
  const bottomVisualizerBar = document.getElementById("bottom-visualizer-bar");
  const visualizerCanvas = document.getElementById("bottom-visualizer-canvas");
  const miniPlayerArtwork = document.getElementById("mini-player-artwork");
  const miniPlayerInfo = document.getElementById("mini-player-info");
  const miniPlayerTitle = document.getElementById("mini-player-title");
  const miniPlayerArtist = document.getElementById("mini-player-artist");
  const miniPlayerPlayPause = document.getElementById("mini-player-play-pause");
  const miniPlayerNext = document.getElementById("mini-player-next");
  const miniPlayerPrev = document.getElementById("mini-player-prev");
  const miniPlayerQueue = document.getElementById("mini-player-queue");
  const playerFullscreen = document.getElementById("player-fullscreen");
  const closePlayerBtn = document.getElementById("close-player-btn");
  const playerBg = document.getElementById("player-bg");
  const playerArtwork = document.getElementById("player-artwork");
  const playerTitle = document.getElementById("player-title");
  const playerArtist = document.getElementById("player-artist");
  const sourceSwitcher = document.getElementById("source-switcher");
  const playPauseBtn = document.getElementById("play-pause-btn");
  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");
  const progressContainer = document.getElementById("progress-container");
  const progressBar = document.getElementById("progress-bar");
  const currentTimeEl = document.getElementById("current-time");
  const durationEl = document.getElementById("duration");
  const lyricsContainer = document.getElementById("lyrics-container");
  const queueBtn = document.getElementById("queue-btn");
  const playlistView = document.getElementById("playlist-view");
  const closePlaylistBtn = document.getElementById("close-playlist-btn");
  const playlistList = document.getElementById("playlist-list");
  const downloadModal = document.getElementById("download-modal");
  const closeDownloadModalBtn = document.getElementById(
    "close-download-modal-btn",
  );
  const modeBtnNormal = document.getElementById("mode-btn-normal");
  const modeBtnShare = document.getElementById("mode-btn-share");
  const shareModeFooter = document.getElementById("share-mode-footer");
  const selectionCounter = document.getElementById("selection-counter");
  const generatePlaylistBtn = document.getElementById("generate-playlist-btn");
  const toastNotification = document.getElementById("toast-notification");
  const toastMessage = document.getElementById("toast-message");
  const editPlaylistModal = document.getElementById("edit-playlist-modal");
  const editPlaylistNameInput = document.getElementById("edit-playlist-name");
  const editPlaylistCoverInput = document.getElementById("edit-playlist-cover");
  const editPlaylistCoverPreview = document.getElementById(
    "edit-playlist-cover-preview",
  );
  const savePlaylistChangesBtn = document.getElementById(
    "save-playlist-changes-btn",
  );
  const closeEditPlaylistModalBtn = document.getElementById(
    "close-edit-playlist-modal-btn",
  );
  let lyricsTrack = null;
  let proofOfWorkWorker = null;
  let audioContext = null;
  let analyser = null;
  let sourceNode = null;
  let visualizerFrameId = null;
  const FILE_MAP = {
    eac3joc: {
      name: "杜比全景声",
      file: "DD.mp4",
      badge: "DOLBY ATMOS",
      metadata: {
        codec: "E-AC-3 JOC",
        bitDepth: "24 bit",
        sampleRate: "48 kHz",
      },
    },
    binaural: {
      name: "杜比双耳",
      file: "DDB.wav",
      badge: "BINAURAL",
      metadata: { codec: "PCM", bitDepth: "24 bit", sampleRate: "48 kHz" },
    },
    original: { name: "原音频", file: "ORI.flac", badge: "Hi-Res" },
  };
  const workerCode = `async function solveChallenge(challenge,difficulty){let nonce=0;const prefix='0'.repeat(difficulty);while(true){const attempt=challenge+nonce;const encoder=new TextEncoder();const data=encoder.encode(attempt);const hashBuffer=await crypto.subtle.digest('SHA-256',data);const hashArray=Array.from(new Uint8Array(hashBuffer));const hashHex=hashArray.map(b=>b.toString(16).padStart(2,'0')).join('');if(hashHex.startsWith(prefix)){postMessage({success:true,nonce:nonce,hash:hashHex});return}nonce++;if(nonce%1000===0){await new Promise(resolve=>setTimeout(resolve,0))}}}self.onmessage=(e)=>{const{challenge,difficulty}=e.data;solveChallenge(challenge,difficulty)};`;
  function generateCrc32Table() {
    const table = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c;
    }
    return table;
  }
  const CRC_TABLE = generateCrc32Table();
  function crc32(str) {
    let crc = -1;
    for (let i = 0; i < str.length; i++) {
      crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ str.charCodeAt(i)) & 0xff];
    }
    return (crc ^ -1) >>> 0;
  }
  function generatePlaylistId(songIds) {
    if (!songIds || songIds.length === 0) return "";
    const concatenatedIds = songIds.join("|");
    const numericHash = crc32(concatenatedIds);
    return numericHash.toString(36);
  }
  async function init() {
    try {
      const verificationModal = document.getElementById(
        "global-verification-modal",
      );
      await runProofOfWorkVerification();
      verificationModal.style.opacity = "0";
      setTimeout(() => {
        verificationModal.style.display = "none";
      }, 500);
      const response = await fetch(
        `data/music-list.json?t=${new Date().getTime()}`,
      );
      const data = await response.json();
      appState.songs = data.songs || [];
      appState.albums = data.albums || [];
      loadStateFromCache();
      setupEventListeners();
      handleRouting();
    } catch (error) {
      console.error("初始化失败:", error);
      document.getElementById("global-verification-status").innerHTML =
        "验证失败，请刷新重试。";
    }
  }
  function runProofOfWorkVerification() {
    return new Promise((resolve, reject) => {
      const blob = new Blob([workerCode], { type: "application/javascript" });
      const worker = new Worker(URL.createObjectURL(blob));
      worker.onmessage = (e) => {
        if (e.data.success) {
          console.log("全局 PoW 验证成功!", e.data);
          worker.terminate();
          resolve();
        }
      };
      worker.onerror = (e) => {
        console.error("全局 PoW Worker 错误:", e);
        worker.terminate();
        reject(e);
      };
      const challenge =
        Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);
      const difficulty = 1;
      worker.postMessage({ challenge, difficulty });
    });
  }
  function runDownloadProofOfWork() {
    return new Promise((resolve, reject) => {
      const blob = new Blob([workerCode], { type: "application/javascript" });
      proofOfWorkWorker = new Worker(URL.createObjectURL(blob));
      proofOfWorkWorker.onmessage = (e) => {
        if (e.data.success) {
          console.log("下载 PoW 验证成功!", e.data);
          proofOfWorkWorker.terminate();
          proofOfWorkWorker = null;
          resolve();
        }
      };
      proofOfWorkWorker.onerror = (e) => {
        console.error("下载 PoW Worker 错误:", e);
        proofOfWorkWorker.terminate();
        proofOfWorkWorker = null;
        reject(e);
      };
      const challenge =
        Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);
      const difficulty = 5;
      proofOfWorkWorker.postMessage({ challenge, difficulty });
    });
  }
  function saveStateToCache() {
    try {
      const stateToSave = {
        playQueue: appState.playQueue.map((song) => song.id),
        currentSongIndexInQueue: appState.currentSongIndexInQueue,
        currentTime: appState.currentSong ? audioPlayer.currentTime : 0,
        preferredSource: appState.preferredSource,
        cachedPlaylists: appState.cachedPlaylists,
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(stateToSave));
    } catch (error) {
      console.error("无法保存播放状态:", error);
    }
  }
  function loadStateFromCache() {
    try {
      const cachedStateJSON = localStorage.getItem(CACHE_KEY);
      if (!cachedStateJSON) return;
      const cachedState = JSON.parse(cachedStateJSON);
      if (cachedState.cachedPlaylists) {
        appState.cachedPlaylists = cachedState.cachedPlaylists;
      }
      const validQueueSongIds = (cachedState.playQueue || []).filter((songId) =>
        appState.songs.some((s) => s.id === songId),
      );
      if (validQueueSongIds.length > 0) {
        appState.playQueue = validQueueSongIds.map((id) =>
          appState.songs.find((s) => s.id === id),
        );
        appState.currentSongIndexInQueue = Math.max(
          0,
          Math.min(
            cachedState.currentSongIndexInQueue,
            appState.playQueue.length - 1,
          ),
        );
        appState.preferredSource = cachedState.preferredSource;
        const songToRestore =
          appState.playQueue[appState.currentSongIndexInQueue];
        if (songToRestore) {
          appState.currentSong = songToRestore;
          updateAllPlayerUIs(songToRestore);
          showMiniPlayer();
          renderPlaylistView();
          audioPlayer.src = getPrioritizedSource(songToRestore);
          audioPlayer.addEventListener(
            "loadedmetadata",
            () => {
              audioPlayer.currentTime = cachedState.currentTime || 0;
            },
            { once: true },
          );
        }
      }
    } catch (error) {
      console.error("从缓存加载状态失败:", error);
      localStorage.removeItem(CACHE_KEY);
    }
  }
  function generateSongTags(song) {
    let tags = [];
    if (song.availableFiles.eac3joc)
      tags.push(`<span class="tag-item tag-dolby-atmos">DOLBY</span>`);
    if (song.availableFiles.binaural)
      tags.push(`<span class="tag-item tag-binaural">BINAURAL</span>`);
    if (song.availableFiles.original && song.availableFiles.original.metadata) {
      const quality = song.availableFiles.original.metadata.quality;
      if (quality === "Hi-Res")
        tags.push(`<span class="tag-item tag-hires">Hi-Res</span>`);
      else if (quality === "CD")
        tags.push(`<span class="tag-item tag-cd">CD</span>`);
    }
    return tags.length > 0
      ? `<div class="mt-4 flex flex-wrap gap-2">${tags.join("")}</div>`
      : "";
  }
  function handleRouting() {
    const hash = window.location.hash;
    if (hash.startsWith("#/song/")) {
      const songId = hash.substring(7);
      renderSongDetailPage(songId);
      navigateTo("song-detail");
    } else if (hash.startsWith("#/album/")) {
      const albumId = hash.substring(8);
      renderAlbumDetailPage(albumId);
      navigateTo("album-detail");
    } else if (hash.startsWith("#/playlist/import/")) {
      try {
        const parts = hash.substring(18).split("/");
        const playlistId = parts[0];
        const encodedData = parts[1];
        const songIdsStr = atob(
          encodedData.replace(/-/g, "+").replace(/_/g, "/"),
        );
        const songIds = songIdsStr.split(",");
        if (playlistId && songIds.length > 0) {
          appState.cachedPlaylists[playlistId] = {
            id: playlistId,
            name: `歌单#${playlistId}`,
            songs: songIds.filter((id) =>
              appState.songs.some((s) => s.id === id),
            ),
          };
          saveStateToCache();
          showToast(`歌单#${playlistId}已成功缓存！`);
        }
      } catch (error) {
        console.error("解析歌单链接失败:", error);
        showToast("无效的歌单链接", true);
      }
      window.location.hash = "#";
      renderLibraryView();
      navigateTo("library");
    } else if (hash.startsWith("#/playlist/")) {
      const playlistId = hash.substring(11);
      renderPlaylistDetailPage(playlistId);
      navigateTo("playlist-detail");
    } else {
      renderLibraryView();
      navigateTo("library");
    }
  }
  function navigateTo(viewId) {
    appState.currentView = viewId;
    document
      .querySelectorAll(".view")
      .forEach((view) => view.classList.add("hidden"));
    const targetView = document.getElementById(`${viewId}-view`);
    if (targetView) targetView.classList.remove("hidden");
  }
  function renderLibraryView() {
    let cachedPlaylistsHTML = "";
    const playlistIds = Object.keys(appState.cachedPlaylists);
    if (playlistIds.length > 0) {
      const playlistCards = playlistIds
        .map((id) => {
          const playlist = appState.cachedPlaylists[id];
          const songCount = playlist.songs.length;
          let artworkHTML = "";
          if (playlist.coverImage) {
            artworkHTML = `<img src="${playlist.coverImage}"class="w-full h-full object-cover">`;
          } else {
            const artworks = playlist.songs.slice(0, 4).map((songId) => {
              const song = appState.songs.find((s) => s.id === songId);
              return song && song.hasArtwork
                ? `media/songs/${song.id}/cover.jpg`
                : "data/notfound.png";
            });
            artworkHTML = artworks
              .map(
                (src) =>
                  `<img src="${src}" class="w-full h-full object-cover">`,
              )
              .join("");
          }
          return `
                    <div class="playlist-card block group" data-playlist-id="${id}">
                        <div class="w-full aspect-square rounded-lg overflow-hidden grid ${playlist.coverImage ? "grid-cols-1" : "grid-cols-2 grid-rows-2"} gap-0 bg-gray-200">
                            ${artworkHTML}
                        </div>
                        <p class="font-semibold truncate mt-2">${playlist.name}</p>
                        <p class="text-sm">${songCount} 首歌曲</p>
                    </div>
                `;
        })
        .join("");
      cachedPlaylistsHTML = `
                <section id="cached-playlists-section" class="mb-12">
                    <h2 class="text-2xl font-bold mb-4">缓存的歌单</h2>
                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">${playlistCards}</div>
                </section>
            `;
    }

    const albumsHTML = appState.albums
      .map((album) => {
        const artworkSrc = album.hasArtwork
          ? `media/albums/${album.id}/cover.jpg`
          : "data/notfound.png";
        return `<a href="#/album/${album.id}" class="album-card block group">
                        <div class="overflow-hidden rounded-lg">
                            <img src="${artworkSrc}" class="w-full aspect-square object-cover mb-2 transform group-hover:scale-105 transition-transform duration-300">
                        </div>
                        <p class="font-semibold truncate mt-2">${album.title}</p>
                        <p class="text-sm">${album.artist}</p>
                    </a>`;
      })
      .join("");
    const albumsSection = `
            <section id="albums-section" class="mb-12">
                <h2 class="text-2xl font-bold mb-4">专辑</h2>
                ${appState.albums.length > 0 ? `<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">${albumsHTML}</div>` : '<p class="text-neutral-500">暂无专辑。</p>'}
            </section>`;

    const songsHTML = appState.songs
      .map((song) => {
        const artworkSrc = song.hasArtwork
          ? `media/songs/${song.id}/cover.jpg`
          : "data/notfound.png";
        const tagsHTML = generateSongTags(song).replace("mt-4", "");
        const checkboxHTML = `
                <div class="song-checkbox mr-4">
                    <div class="checkbox-custom">
                        <i class="fas fa-check"></i>
                    </div>
                </div>`;
        return `
                <div class="song-item-v4 flex items-center p-2 rounded-md justify-between cursor-pointer" data-song-id="${song.id}">
                    ${checkboxHTML}
                    <div class="flex items-center flex-grow gap-4 song-info overflow-hidden">
                        <img src="${artworkSrc}" class="w-10 h-10 rounded-md flex-shrink-0">
                        <div class="overflow-hidden">
                            <p class="font-medium truncate">${song.title}</p>
                            <p class="text-sm truncate">${song.artist}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-4">
                        <div class="hidden sm:flex flex-wrap gap-2 justify-end">${tagsHTML}</div>
                        <a href="#/song/${song.id}" class="share-btn p-2 rounded-full hover:bg-gray-300 flex-shrink-0" title="详情与分享"><i class="fas fa-ellipsis-h text-gray-500"></i></a>
                    </div>
                </div>`;
      })
      .join("");
    const songsSection = `
            <section id="songs-section">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-2xl font-bold">所有歌曲</h2>
                    <button id="play-all-library-btn" class="action-btn primary"><i class="fas fa-play"></i> 播放全部</button>
                </div>
                <div id="song-list" class="space-y-1">${songsHTML}</div>
            </section>`;

    libraryView.innerHTML = cachedPlaylistsHTML + albumsSection + songsSection;

    libraryView.addEventListener("click", (event) => {
      const playlistCard = event.target.closest(".playlist-card");
      const songItem = event.target.closest(".song-item-v4");
      const playAllBtn = event.target.closest("#play-all-library-btn");

      if (playlistCard) {
        const playlistId = playlistCard.dataset.playlistId;
        window.location.hash = `#/playlist/${playlistId}`;
        return;
      }

      if (songItem) {
        if (appState.currentMode === "share") {
          if (!event.target.closest(".share-btn")) {
            toggleShareSelection(songItem.dataset.songId, songItem);
          }
        } else {
          if (!event.target.closest(".share-btn")) {
            const song = appState.songs.find(
              (s) => s.id === songItem.dataset.songId,
            );
            if (song) playSong(song);
          }
        }
        return;
      }

      if (playAllBtn) {
        if (appState.songs.length > 0) {
          appState.playQueue = [...appState.songs];
          playFromQueue(0);
        }
        return;
      }
    });
  }

  function renderAlbumDetailPage(albumId) {
    const album = appState.albums.find((a) => a.id === albumId);
    if (!album) {
      albumDetailView.innerHTML = `<p>专辑不存在或链接无效。</p><a href="#" class="back-btn"><i class="fas fa-arrow-left"></i> 返回曲库</a>`;
      albumDetailView
        .querySelector(".back-btn")
        .addEventListener("click", (e) => {
          e.preventDefault();
          window.location.hash = "#";
        });
      return;
    }

    const albumSongs = album.songs
      .map((songId) => appState.songs.find((s) => s.id === songId))
      .filter(Boolean);
    const artworkSrc = album.hasArtwork
      ? `media/albums/${album.id}/cover.jpg`
      : "data/notfound.png";

    const songsHTML = albumSongs
      .map((song) => {
        const songArtworkSrc = song.hasArtwork
          ? `media/songs/${song.id}/cover.jpg`
          : "data/notfound.png";
        const tagsHTML = generateSongTags(song).replace("mt-4", "");
        return `<div class="song-item-v4 flex items-center p-2 rounded-md justify-between cursor-pointer" data-song-id="${song.id}">
                        <div class="flex items-center flex-grow gap-4 song-info overflow-hidden">
                            <img src="${songArtworkSrc}" class="w-10 h-10 rounded-md flex-shrink-0">
                            <div class="overflow-hidden">
                                <p class="font-medium truncate">${song.title}</p>
                                <p class="text-sm truncate">${song.artist}</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-4">
                            <div class="hidden sm:flex flex-wrap gap-2 justify-end">${tagsHTML}</div>
                            <a href="#/song/${song.id}" class="share-btn p-2 rounded-full hover:bg-gray-300 flex-shrink-0" title="详情与分享"><i class="fas fa-ellipsis-h text-gray-500"></i></a>
                        </div>
                    </div>`;
      })
      .join("");

    albumDetailView.innerHTML = `
            <div><a href="#" class="back-btn" id="back-from-album-btn"><i class="fas fa-arrow-left"></i> 返回曲库</a></div>
            <div class="song-detail-header">
                <img src="${artworkSrc}" class="song-detail-artwork">
                <div class="song-detail-meta">
                    <p class="text-lg font-semibold text-neutral-600 mb-2">专辑</p>
                    <h1 class="title">${album.title}</h1>
                    <p class="artist">${album.artist}</p>
                    <div class="song-detail-actions">
                        <button class="action-btn primary" id="album-play-all-btn"><i class="fas fa-play"></i> 播放全部</button>
                    </div>
                </div>
            </div>
            <div class="mt-8">
                <div id="album-song-list" class="space-y-1">${songsHTML}</div>
            </div>`;

    document
      .getElementById("back-from-album-btn")
      .addEventListener("click", (e) => {
        e.preventDefault();
        window.location.hash = "#";
      });
    document
      .getElementById("album-play-all-btn")
      .addEventListener("click", () => {
        if (albumSongs.length > 0) {
          appState.playQueue = [...albumSongs];
          playFromQueue(0);
        }
      });

    albumDetailView.querySelectorAll(".song-item-v4").forEach((item) => {
      item.addEventListener("click", (e) => {
        if (!e.target.closest(".share-btn")) {
          const song = appState.songs.find((s) => s.id === item.dataset.songId);
          if (song) playSong(song);
        }
      });
    });
  }

  function renderPlaylistDetailPage(playlistId) {
    const playlist = appState.cachedPlaylists[playlistId];
    if (!playlist) {
      playlistDetailView.innerHTML = `<p>歌单不存在或链接无效。</p><a href="#" class="back-btn"><i class="fas fa-arrow-left"></i> 返回曲库</a>`;
      playlistDetailView
        .querySelector(".back-btn")
        .addEventListener("click", (e) => {
          e.preventDefault();
          window.location.hash = "#";
        });
      return;
    }
    const playlistSongs = playlist.songs
      .map((songId) => appState.songs.find((s) => s.id === songId))
      .filter(Boolean);
    let artworkHTML = "";
    if (playlist.coverImage) {
      artworkHTML = `<img src="${playlist.coverImage}" class="w-full h-full object-cover">`;
    } else {
      const artworks = playlistSongs.slice(0, 4).map((song) => {
        return song && song.hasArtwork
          ? `media/songs/${song.id}/cover.jpg`
          : "data/notfound.png";
      });
      artworkHTML = artworks.map((src) => `<img src="${src}">`).join("");
    }
    const songsHTML = playlistSongs
      .map((song) => {
        const songArtworkSrc = song.hasArtwork
          ? `media/songs/${song.id}/cover.jpg`
          : "data/notfound.png";
        const tagsHTML = generateSongTags(song).replace("mt-4", "");
        return `<div class="song-item-v4 flex items-center p-2 rounded-md justify-between cursor-pointer" data-song-id="${song.id}"><div class="flex items-center flex-grow gap-4 song-info overflow-hidden"><img src="${songArtworkSrc}" class="w-10 h-10 rounded-md flex-shrink-0"><div class="overflow-hidden"><p class="font-medium truncate">${song.title}</p><p class="text-sm truncate">${song.artist}</p></div></div><div class="flex items-center gap-4"><div class="hidden sm:flex flex-wrap gap-2 justify-end">${tagsHTML}</div><a href="#/song/${song.id}" class="share-btn p-2 rounded-full hover:bg-gray-300 flex-shrink-0" title="详情与分享"><i class="fas fa-ellipsis-h text-gray-500"></i></a></div></div>`;
      })
      .join("");
    playlistDetailView.innerHTML = `<div><a href="#" class="back-btn" id="back-from-playlist-btn"><i class="fas fa-arrow-left"></i> 返回曲库</a></div><div class="playlist-detail-header"><div class="playlist-detail-artwork ${playlist.coverImage ? "grid-cols-1" : "grid-cols-2 grid-rows-2"}">${artworkHTML}</div><div class="playlist-detail-meta"><p class="text-lg font-semibold text-neutral-600 mb-2">共享歌单</p><h1 class="title">${playlist.name}</h1><p class="subtitle">${playlistSongs.length} 首歌曲</p><div class="playlist-detail-actions"><button class="action-btn primary" id="playlist-play-all-btn"><i class="fas fa-play"></i> 播放全部</button><button class="action-btn secondary" id="playlist-edit-btn"><i class="fas fa-edit"></i> 编辑</button><button class="action-btn secondary btn-danger" id="playlist-delete-btn"><i class="fas fa-trash"></i> 删除</button></div></div></div><div class="mt-8"><div id="playlist-song-list" class="space-y-1">${songsHTML}</div></div>`;
    document
      .getElementById("back-from-playlist-btn")
      .addEventListener("click", (e) => {
        e.preventDefault();
        window.location.hash = "#";
      });
    document
      .getElementById("playlist-play-all-btn")
      .addEventListener("click", () => {
        if (playlistSongs.length > 0) {
          appState.playQueue = [...playlistSongs];
          playFromQueue(0);
          showToast(`开始播放歌单: ${playlist.name}`);
        }
      });
    document
      .getElementById("playlist-edit-btn")
      .addEventListener("click", () => openEditPlaylistModal(playlistId));
    document
      .getElementById("playlist-delete-btn")
      .addEventListener("click", () => {
        if (confirm(`确定要从缓存中删除歌单 "${playlist.name}" 吗？`)) {
          delete appState.cachedPlaylists[playlistId];
          saveStateToCache();
          showToast(`歌单已删除`);
          window.location.hash = "#";
        }
      });
    playlistDetailView.querySelectorAll(".song-item-v4").forEach((item) => {
      item.addEventListener("click", (e) => {
        if (!e.target.closest(".share-btn")) {
          const song = appState.songs.find((s) => s.id === item.dataset.songId);
          if (song) playSong(song);
        }
      });
    });
  }
  async function renderSongDetailPage(songId) {
    const song = appState.songs.find((s) => s.id === songId);
    if (!song) {
      songDetailView.innerHTML = `<p>歌曲不存在或链接无效。</p><a href="#" class="back-btn"><i class="fas fa-arrow-left"></i> 返回曲库</a>`;
      songDetailView
        .querySelector(".back-btn")
        .addEventListener("click", (e) => {
          e.preventDefault();
          window.location.hash = "#";
        });
      return;
    }
    let lyricsHTML = "暂无歌词。";
    if (song.hasLyrics) {
      try {
        const response = await fetch(`media/songs/${song.id}/lyrics.lrc`);
        if (response.ok) {
          const lrc = await response.text();
          lyricsHTML = lrc
            .replace(/\[.*?\]/g, "")
            .trim()
            .split("\n")
            .filter((line) => line)
            .join("<br>");
        } else {
          lyricsHTML = "歌词加载失败。";
        }
      } catch {
        lyricsHTML = "歌词加载失败。";
      }
    }
    const tagsHTML = generateSongTags(song);
    let metadataHTML = "";
    let buyButtonHTML = "";
    for (const key in FILE_MAP) {
      if (song.availableFiles[key]) {
        const fileInfo = FILE_MAP[key];
        if (key === "eac3joc" || key === "binaural") {
          const meta = fileInfo.metadata;
          metadataHTML += `<div class="text-sm text-neutral-500 mt-2"><p><strong>${fileInfo.name}</strong>: ${meta.codec} | ${meta.bitDepth} | ${meta.sampleRate}</p></div>`;
        } else if (key === "original" && song.availableFiles[key].metadata) {
          const meta = song.availableFiles[key].metadata;
          metadataHTML += `<div class="text-sm text-neutral-500 mt-2"><p><strong>${fileInfo.name}</strong>: ${meta.codec} | ${meta.bitDepth} | ${meta.sampleRate}</p></div>`;
        }
      }
    }
    if (song.buy && song.buy.trim() !== "")
      buyButtonHTML = `<a href="${song.buy}" target="_blank" rel="noopener noreferrer" class="action-btn secondary"><i class="fas fa-shopping-cart"></i> 正版购买</a>`;
    const artworkSrc = song.hasArtwork
      ? `media/songs/${song.id}/cover.jpg`
      : "data/notfound.png";
    songDetailView.innerHTML = `<div><a href="#" class="back-btn" id="back-to-library-btn"><i class="fas fa-arrow-left"></i> 返回曲库</a></div><div class="song-detail-header"><img src="${artworkSrc}" class="song-detail-artwork"><div class="song-detail-meta"><h1 class="title">${song.title}</h1><p class="artist">${song.artist}</p>${tagsHTML}${metadataHTML}<div class="song-detail-actions"><button class="action-btn primary" id="detail-play-btn"><i class="fas fa-play"></i> 播放</button><button class="action-btn secondary" id="detail-add-queue-btn"><i class="fas fa-plus"></i> 添至队列</button><button class="action-btn secondary" id="detail-copy-link-btn"><i class="fas fa-link"></i> 复制链接</button><button class="action-btn secondary" id="detail-download-btn"><i class="fas fa-download"></i> 下载</button>${buyButtonHTML}${song.bv && song.bv.trim() !== "" ? `<a href="https://www.bilibili.com/video/${song.bv}" target="_blank" rel="noopener noreferrer" class="action-btn bilibili-btn"><i class="fab fa-bilibili"></i> 在Bilibili中查看</a>` : ""}</div></div></div><div class="song-detail-lyrics"><h3>歌词</h3><p>${lyricsHTML}</p></div>`;
    document
      .getElementById("back-to-library-btn")
      .addEventListener("click", (e) => {
        e.preventDefault();
        window.location.hash = "#";
      });
    document
      .getElementById("detail-play-btn")
      .addEventListener("click", () => playSong(song, false));
    document
      .getElementById("detail-add-queue-btn")
      .addEventListener("click", () => addToQueue(song.id));
    document
      .getElementById("detail-copy-link-btn")
      .addEventListener("click", () => {
        const linkToCopy = window.location.href;
        const textArea = document.createElement("textarea");
        textArea.value = linkToCopy;
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand("copy");
        } catch (err) {
          console.error("无法复制链接:", err);
        }
        document.body.removeChild(textArea);
      });
    document
      .getElementById("detail-download-btn")
      .addEventListener("click", () => openDownloadModal(song));
  }
  function openEditPlaylistModal(playlistId) {
    const playlist = appState.cachedPlaylists[playlistId];
    if (!playlist) return;
    appState.editingPlaylistId = playlistId;
    editPlaylistNameInput.value = playlist.name;
    editPlaylistCoverPreview.src = playlist.coverImage || "data/notfound.png";
    editPlaylistCoverInput.value = "";
    editPlaylistModal.classList.remove("hidden");
    editPlaylistModal.classList.add("flex");
  }
  function closeEditPlaylistModal() {
    editPlaylistModal.classList.add("hidden");
    editPlaylistModal.classList.remove("flex");
    appState.editingPlaylistId = null;
  }
  function handleCoverFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > MAX_COVER_SIZE_BYTES) {
      alert(
        `图片文件太大！请选择小于 ${MAX_COVER_SIZE_BYTES / 1024 / 1024}MB 的文件。`,
      );
      editPlaylistCoverInput.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      editPlaylistCoverPreview.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
  function savePlaylistChanges() {
    const playlistId = appState.editingPlaylistId;
    if (!playlistId) return;
    const playlist = appState.cachedPlaylists[playlistId];
    const newName = editPlaylistNameInput.value.trim();
    if (newName) {
      playlist.name = newName;
    }
    if (!editPlaylistCoverPreview.src.endsWith("data/notfound.png")) {
      playlist.coverImage = editPlaylistCoverPreview.src;
    }
    saveStateToCache();
    closeEditPlaylistModal();
    renderPlaylistDetailPage(playlistId);
    showToast("歌单信息已更新！");
  }
  function setupEventListeners() {
    window.addEventListener("hashchange", handleRouting);
    window.addEventListener("beforeunload", saveStateToCache);
    closePlayerBtn.addEventListener("click", hideFullScreenPlayer);
    playPauseBtn.addEventListener("click", togglePlayPause);
    miniPlayerPlayPause.addEventListener("click", togglePlayPause);
    miniPlayerArtwork.addEventListener("click", showFullScreenPlayer);
    miniPlayerInfo.addEventListener("click", showFullScreenPlayer);
    miniPlayerNext.addEventListener("click", playNext);
    miniPlayerPrev.addEventListener("click", playPrev);
    miniPlayerQueue.addEventListener("click", showPlaylistView);
    prevBtn.addEventListener("click", playPrev);
    nextBtn.addEventListener("click", playNext);
    queueBtn.addEventListener("click", showPlaylistView);
    closePlaylistBtn.addEventListener("click", hidePlaylistView);
    searchInput.addEventListener("input", handleSearch);
    modeBtnNormal.addEventListener("click", () => setMode("normal"));
    modeBtnShare.addEventListener("click", (e) => {
      setMode("share");
      playRippleAnimation(e);
    });
    generatePlaylistBtn.addEventListener("click", generateAndCopyShareUrl);
    closeEditPlaylistModalBtn.addEventListener("click", closeEditPlaylistModal);
    editPlaylistModal.addEventListener("click", (e) => {
      if (e.target === editPlaylistModal) closeEditPlaylistModal();
    });
    editPlaylistCoverInput.addEventListener("change", handleCoverFileSelect);
    savePlaylistChangesBtn.addEventListener("click", savePlaylistChanges);
    audioPlayer.addEventListener("play", () => {
      updatePlayPauseButtons(true);
      if (!audioContext) setupVisualizer();
      if (audioContext && audioContext.state === "suspended")
        audioContext.resume();
      startVisualizer();
    });
    audioPlayer.addEventListener("pause", () => {
      updatePlayPauseButtons(false);
      stopVisualizer();
    });
    audioPlayer.addEventListener("ended", () => {
      stopVisualizer();
      playNext();
    });
    audioPlayer.addEventListener("timeupdate", () => {
      const { duration, currentTime } = audioPlayer;
      if (duration && appState.currentSong) {
        progressBar.style.width = `${(currentTime / duration) * 100}%`;
        currentTimeEl.textContent = formatTime(currentTime);
        durationEl.textContent = formatTime(duration);
        updateLyrics(currentTime);
      }
    });
    progressContainer.addEventListener("click", (e) => {
      const rect = progressContainer.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const width = rect.width;
      audioPlayer.currentTime = (clickX / width) * audioPlayer.duration;
    });
    closeDownloadModalBtn.addEventListener("click", closeDownloadModal);
    downloadModal.addEventListener("click", (e) => {
      if (e.target === downloadModal) closeDownloadModal();
    });
    window.addEventListener("resize", () => {
      if (visualizerFrameId !== null) {
        stopVisualizer();
        startVisualizer();
      }
    });
  }
  function handleSearch() {
    const term = searchInput.value.trim();
    if (term.includes("#/playlist/import/")) {
      try {
        const hash = new URL(term).hash;
        window.location.hash = hash;
        handleRouting();
      } catch (e) {
        showToast("无效的分享链接", true);
      }
      return;
    }
    if (term) {
      const lowerTerm = term.toLowerCase();
      const songResults = appState.songs.filter((song) => {
        const hasTag =
          song.tags &&
          song.tags.some((tag) => tag.toLowerCase().includes(lowerTerm));
        return (
          song.title.toLowerCase().includes(lowerTerm) ||
          song.artist.toLowerCase().includes(lowerTerm) ||
          hasTag
        );
      });
      const songsFromAlbumResults = appState.albums
        .filter(
          (album) =>
            album.title.toLowerCase().includes(lowerTerm) ||
            album.artist.toLowerCase().includes(lowerTerm),
        )
        .flatMap((album) => album.songs)
        .map((songId) => appState.songs.find((s) => s.id === songId))
        .filter(Boolean);
      const allResults = [...songResults, ...songsFromAlbumResults];
      const uniqueResults = [
        ...new Map(allResults.map((item) => [item["id"], item])).values(),
      ];
      renderSearchResults(uniqueResults);
      navigateTo("search");
    } else {
      window.location.hash = "#";
    }
  }
  function renderSearchResults(results) {
    const backButton = `<div><a href="#" class="back-btn" onclick="window.location.hash='#'; return false;"><i class="fas fa-arrow-left"></i> 返回曲库</a></div>`;
    if (results.length === 0) {
      searchView.innerHTML = `${backButton}<header class="mb-8"><h2 class="text-3xl font-bold text-black">搜索结果</h2></header><p class="text-neutral-500">未找到关于“${searchInput.value.trim()}”的结果。</p>`;
      return;
    }
    const songsHTML = results
      .map((song) => {
        const artworkSrc = song.hasArtwork
          ? `media/songs/${song.id}/cover.jpg`
          : "data/notfound.png";
        const tagsHTML = generateSongTags(song);
        const checkboxHTML = `<div class="song-checkbox mr-4"><div class="checkbox-custom"><i class="fas fa-check"></i></div></div>`;
        return `<div class="song-item-v4 flex items-center p-2 rounded-md justify-between cursor-pointer" data-song-id="${song.id}">${checkboxHTML}<div class="flex items-center flex-grow gap-4 song-info"><img src="${artworkSrc}" class="w-10 h-10 rounded-md"><div><p class="font-medium">${song.title}</p><p class="text-sm">${song.artist}</p></div></div><div class="flex flex-wrap gap-2">${tagsHTML}</div><a href="#/song/${song.id}" class="share-btn p-2 rounded-full hover:bg-gray-300 flex-shrink-0" title="详情与分享"><i class="fas fa-ellipsis-h"></i></a></div>`;
      })
      .join("");
    searchView.innerHTML = `${backButton}<header class="mb-8 flex justify-between items-center"><h2 class="text-3xl font-bold text-black">搜索结果</h2><button id="play-all-search-btn" class="action-btn primary"><i class="fas fa-play"></i> 播放全部 (${results.length})</button></header><div class="space-y-1">${songsHTML}</div>`;
    searchView.querySelectorAll(".song-item-v4").forEach((item) => {
      item.addEventListener("click", (e) => {
        if (appState.currentMode === "share") {
          if (!e.target.closest(".share-btn"))
            toggleShareSelection(item.dataset.songId, item);
        } else {
          if (!e.target.closest(".share-btn")) {
            const song = appState.songs.find(
              (s) => s.id === item.dataset.songId,
            );
            if (song) playSong(song);
          }
        }
      });
    });
    document
      .getElementById("play-all-search-btn")
      .addEventListener("click", () => {
        if (results.length > 0) {
          appState.playQueue = [...results];
          playFromQueue(0);
        }
      });
  }
  async function openDownloadModal(song) {
    const downloadLinks = document.getElementById("download-links");
    const verificationStatus = document.getElementById("verification-status");
    const downloadModalTitle = document.getElementById("download-modal-title");
    const downloadModalSubtitle = document.getElementById(
      "download-modal-subtitle",
    );
    downloadLinks.innerHTML = "";
    downloadModalTitle.textContent = `下载: ${song.title}`;
    downloadModalSubtitle.textContent = "正在进行安全验证，请稍候...";
    verificationStatus.classList.remove("hidden");
    downloadLinks.classList.add("hidden");
    downloadModal.classList.add("visible");
    try {
      await runDownloadProofOfWork();
      downloadModalSubtitle.textContent = "验证成功！请选择要下载的文件。";
      verificationStatus.classList.add("hidden");
      generateAndShowDownloadLinks(song);
    } catch (error) {
      downloadModalSubtitle.textContent = "验证失败或已取消，请重试。";
      console.error("下载验证失败:", error);
    }
  }
  function generateAndShowDownloadLinks(song) {
    const downloadLinks = document.getElementById("download-links");
    Object.keys(FILE_MAP).forEach((key) => {
      const fileInfo = FILE_MAP[key];
      const link = document.createElement("a");
      let badgeText = fileInfo.badge;
      if (
        key === "original" &&
        song.availableFiles.original &&
        song.availableFiles.original.metadata
      ) {
        badgeText = song.availableFiles.original.metadata.quality;
      }
      if (song.availableFiles[key]) {
        link.href = `media/songs/${song.id}/${fileInfo.file}`;
        const fileExtension = fileInfo.file.split(".").pop();
        link.download = `${song.title} - ${song.artist} - ${fileInfo.name}.${fileExtension}`;
        link.textContent = `下载 ${fileInfo.name} (${badgeText})`;
      } else {
        link.classList.add("disabled");
        link.textContent = `下载 ${fileInfo.name} (${badgeText})`;
      }
      downloadLinks.appendChild(link);
    });
    downloadLinks.classList.remove("hidden");
  }
  function closeDownloadModal() {
    downloadModal.classList.remove("visible");
    if (proofOfWorkWorker) {
      proofOfWorkWorker.terminate();
      proofOfWorkWorker = null;
      console.log("下载验证Worker已由用户关闭。");
    }
  }
  function setMode(mode) {
    if (appState.currentMode === mode) return;
    appState.currentMode = mode;
    if (mode === "share") {
      appMain.classList.add("share-mode");
      modeBtnShare.classList.add("active");
      modeBtnNormal.classList.remove("active");
      searchInput.placeholder = "输入分享链接可缓存歌单";
      miniPlayer.style.pointerEvents = "none";
      if (playerFullscreen) playerFullscreen.style.display = "none";
      if (bottomVisualizerBar) bottomVisualizerBar.style.display = "none";
    } else {
      appMain.classList.remove("share-mode");
      modeBtnNormal.classList.add("active");
      modeBtnShare.classList.remove("active");
      searchInput.placeholder = "搜索歌曲、艺人";
      miniPlayer.style.pointerEvents = "auto";
      if (playerFullscreen) playerFullscreen.style.display = "flex";
      if (bottomVisualizerBar) bottomVisualizerBar.style.display = "block";
      appState.shareSelection = [];
      document
        .querySelectorAll(".song-item-v4.selected")
        .forEach((el) => el.classList.remove("selected"));
      updateShareFooter();
    }
  }
  function playRippleAnimation(event) {
    const ripple = document.createElement("span");
    const rect = event.currentTarget.getBoundingClientRect();
    const screenDiag = Math.sqrt(
      window.innerWidth ** 2 + window.innerHeight ** 2,
    );
    const size = screenDiag * 2;
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${rect.left + rect.width / 2 - size / 2}px`;
    ripple.style.top = `${rect.top + rect.height / 2 - size / 2}px`;
    ripple.classList.add("ripple");
    fullscreenRippleContainer.appendChild(ripple);
    setTimeout(() => ripple.remove(), 800);
  }
  function toggleShareSelection(songId, songElement) {
    const index = appState.shareSelection.indexOf(songId);
    if (index > -1) {
      appState.shareSelection.splice(index, 1);
      songElement.classList.remove("selected");
    } else {
      appState.shareSelection.push(songId);
      songElement.classList.add("selected");
    }
    updateShareFooter();
  }
  function updateShareFooter() {
    const count = appState.shareSelection.length;
    if (count > 0) {
      selectionCounter.textContent = `已选择 ${count} 首歌曲`;
      generatePlaylistBtn.disabled = false;
      shareModeFooter.style.transform = "translateY(0)";
    } else {
      generatePlaylistBtn.disabled = true;
      shareModeFooter.style.transform = "translateY(100%)";
    }
  }
  function generateAndCopyShareUrl() {
    if (appState.shareSelection.length === 0) return;
    const playlistId = generatePlaylistId(appState.shareSelection);
    const songIdsStr = appState.shareSelection.join(",");
    const encodedData = btoa(songIdsStr)
      .replace(/\+/g, "-")
      .replace(/_/g, "_")
      .replace(/=+$/, "");
    const shareUrl = `${window.location.origin}${window.location.pathname}#/playlist/import/${playlistId}/${encodedData}`;
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => {
        showToast("分享链接已复制到剪贴板！");
        setMode("normal");
      })
      .catch((err) => {
        console.error("复制失败:", err);
        showToast("复制失败，请手动复制", true);
      });
  }
  let toastTimer;
  function showToast(message, isError = false) {
    clearTimeout(toastTimer);
    toastMessage.textContent = message;
    toastNotification.style.backgroundColor = isError ? "#b91c1c" : "#16a34a";
    toastNotification.style.opacity = "1";
    toastNotification.style.transform = "translate(-50%,0)";
    toastTimer = setTimeout(() => {
      toastNotification.style.opacity = "0";
      toastNotification.style.transform = "translate(-50%,1rem)";
    }, 3000);
  }
  function playSong(song, isFromQueue = false) {
    if (!song) return;
    if (!isFromQueue) {
      if (
        appState.playQueue.length > 0 &&
        appState.currentSong &&
        appState.playQueue[appState.currentSongIndexInQueue].id === song.id
      ) {
        if (audioPlayer.paused) audioPlayer.play();
        return;
      }
      const existingIndex = appState.playQueue.findIndex(
        (s) => s.id === song.id,
      );
      if (existingIndex > -1) {
        appState.playQueue.splice(existingIndex, 1);
      }
      appState.playQueue.unshift(song);
      appState.currentSongIndexInQueue = 0;
    }
    appState.currentSong = song;
    audioPlayer.src = getPrioritizedSource(song);
    audioPlayer.play();
    showMiniPlayer();
    updateAllPlayerUIs(song);
    fetchAndRenderLyrics(song);
    renderPlaylistView();
    saveStateToCache();
  }
  function playFromQueue(index) {
    if (index >= 0 && index < appState.playQueue.length) {
      appState.currentSongIndexInQueue = index;
      const songToPlay = appState.playQueue[index];
      playSong(songToPlay, true);
    }
  }
  function playNext() {
    const nextIndex = appState.currentSongIndexInQueue + 1;
    if (nextIndex < appState.playQueue.length) {
      playFromQueue(nextIndex);
    }
  }
  function playPrev() {
    const prevIndex = appState.currentSongIndexInQueue - 1;
    if (prevIndex >= 0) {
      playFromQueue(prevIndex);
    }
  }
  function addToQueue(songId) {
    const songToAdd = appState.songs.find((s) => s.id === songId);
    if (songToAdd && !appState.playQueue.find((s) => s.id === songId)) {
      appState.playQueue.push(songToAdd);
      renderPlaylistView();
      if (!appState.currentSong) {
        playFromQueue(0);
      }
      saveStateToCache();
    }
  }
  function togglePlayPause() {
    if (!appState.currentSong) return;
    if (audioPlayer.paused) {
      audioPlayer.play();
    } else {
      audioPlayer.pause();
    }
  }
  function getPrioritizedSource(song) {
    if (
      appState.preferredSource &&
      song.availableFiles[appState.preferredSource]
    ) {
      const preferred = appState.preferredSource;
      if (!(preferred === "eac3joc" && !isSafari)) {
        appState.currentSource = preferred;
        return `media/songs/${song.id}/${FILE_MAP[preferred].file}`;
      }
    }
    const priorityOrder = ["original", "binaural", "eac3joc"];
    const sourceKey = priorityOrder.find((src) => song.availableFiles[src]);
    appState.currentSource = sourceKey;
    return sourceKey
      ? `media/songs/${song.id}/${FILE_MAP[sourceKey].file}`
      : "";
  }
  function setSource(sourceType, shouldPlay = true) {
    if (
      !appState.currentSong ||
      !appState.currentSong.availableFiles[sourceType]
    )
      return;
    appState.preferredSource = sourceType;
    const currentTime = audioPlayer.currentTime;
    const wasPlaying = !audioPlayer.paused;
    appState.currentSource = sourceType;
    audioPlayer.src = `media/songs/${appState.currentSong.id}/${FILE_MAP[sourceType].file}`;
    audioPlayer.addEventListener(
      "loadeddata",
      () => {
        if (wasPlaying || shouldPlay) {
          audioPlayer.currentTime = currentTime;
          audioPlayer.play();
        }
      },
      { once: true },
    );
    updateSourceSwitcher();
    saveStateToCache();
  }
  function updateAllPlayerUIs(song) {
    const artworkSrc = song.hasArtwork
      ? `media/songs/${song.id}/cover.jpg`
      : "data/notfound.png";
    miniPlayerArtwork.src = artworkSrc;
    miniPlayerTitle.textContent = song.title;
    miniPlayerArtist.textContent = song.artist;
    playerBg.style.backgroundImage = `url('${artworkSrc}')`;
    playerArtwork.src = artworkSrc;
    playerTitle.textContent = song.title;
    playerArtist.textContent = song.artist;
    updateSourceSwitcher();
  }
  function updatePlayPauseButtons(isPlaying) {
    appState.isPlaying = isPlaying;
    const playIconClass = "fa-play";
    const pauseIconClass = "fa-pause";
    miniPlayerPlayPause.innerHTML = `<i class="fas ${isPlaying ? pauseIconClass : playIconClass}"></i>`;
    document.getElementById("play-icon").classList.toggle("hidden", isPlaying);
    document
      .getElementById("pause-icon")
      .classList.toggle("hidden", !isPlaying);
  }
  function updateSourceSwitcher() {
    if (!appState.currentSong) return;
    sourceSwitcher.innerHTML = "";
    Object.keys(FILE_MAP).forEach((key) => {
      if (appState.currentSong.availableFiles[key]) {
        const button = document.createElement("button");
        let badgeText = FILE_MAP[key].badge;
        if (
          key === "original" &&
          appState.currentSong.availableFiles.original.metadata
        ) {
          const quality =
            appState.currentSong.availableFiles.original.metadata.quality;
          if (quality === "Hi-Res") badgeText = "Hi-Res";
          else if (quality === "CD") badgeText = "CD";
        }
        button.textContent = badgeText;
        button.className = "source-btn";
        if (key === "eac3joc" && !isSafari) {
          button.classList.add("disabled");
          button.dataset.tooltip = "仅支持Safari浏览器";
        } else {
          button.addEventListener("click", () => setSource(key));
        }
        if (key === appState.currentSource) button.classList.add("active");
        sourceSwitcher.appendChild(button);
      }
    });
  }
  function renderPlaylistView() {
    const queueSongs = appState.playQueue;
    playlistList.innerHTML = queueSongs
      .map((song, index) => {
        const artworkSrc = song.hasArtwork
          ? `media/songs/${song.id}/cover.jpg`
          : "data/notfound.png";
        const isPlaying = index === appState.currentSongIndexInQueue;
        return `<div class="playlist-item ${isPlaying ? "playing" : ""}" data-queue-index="${index}"><img src="${artworkSrc}" class="playlist-item-artwork"><div class="playlist-item-info"><p class="title">${song.title}</p><p class="artist">${song.artist}</p></div></div>`;
      })
      .join("");
    playlistList.querySelectorAll(".playlist-item").forEach((item) => {
      item.addEventListener("click", () =>
        playFromQueue(parseInt(item.dataset.queueIndex)),
      );
    });
  }
  function showFullScreenPlayer() {
    if (!appState.currentSong) return;
    if (audioPlayer.paused) audioPlayer.play();
    playerFullscreen.style.transform = "translateY(0)";
  }
  function hideFullScreenPlayer() {
    playerFullscreen.style.transform = "translateY(100%)";
  }
  function showMiniPlayer() {
    miniPlayer.classList.add("visible");
  }
  function showPlaylistView() {
    playlistView.classList.add("visible");
  }
  function hidePlaylistView() {
    playlistView.classList.remove("visible");
  }
  function setupVisualizer() {
    if (audioContext) return;
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      sourceNode = audioContext.createMediaElementSource(audioPlayer);
      analyser = audioContext.createAnalyser();
      sourceNode.connect(analyser);
      analyser.connect(audioContext.destination);
      analyser.fftSize = 256;
      console.log("频谱分析器设置成功。");
    } catch (e) {
      console.error("此浏览器不支持Web Audio API。", e);
    }
  }
  function startVisualizer() {
    if (!analyser || visualizerFrameId !== null || !bottomVisualizerBar) return;
    bottomVisualizerBar.style.transform = "translateY(0)";
    const canvas = visualizerCanvas;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    drawVisualizer();
  }
  function drawVisualizer() {
    if (!analyser) return;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);
    const canvasCtx = visualizerCanvas.getContext("2d");
    const WIDTH = visualizerCanvas.width;
    const HEIGHT = visualizerCanvas.height;
    canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);
    canvasCtx.lineWidth = 4;
    canvasCtx.strokeStyle = "rgba(0,0,0,0.5)";
    canvasCtx.beginPath();
    const sliceWidth = (WIDTH * 1.0) / bufferLength;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 255.0;
      const y = HEIGHT - v * HEIGHT;
      if (i === 0) canvasCtx.moveTo(x, y);
      else canvasCtx.lineTo(x, y);
      x += sliceWidth;
    }
    canvasCtx.stroke();
    visualizerFrameId = requestAnimationFrame(drawVisualizer);
  }
  function stopVisualizer() {
    if (visualizerFrameId !== null) {
      cancelAnimationFrame(visualizerFrameId);
      visualizerFrameId = null;
    }
    if (bottomVisualizerBar) {
      bottomVisualizerBar.style.transform = "translateY(100%)";
    }
    if (visualizerCanvas) {
      const canvasCtx = visualizerCanvas.getContext("2d");
      canvasCtx.clearRect(
        0,
        0,
        visualizerCanvas.width,
        visualizerCanvas.height,
      );
    }
  }
  async function fetchAndRenderLyrics(song) {
    lyricsContainer.innerHTML = '<div id="lyrics-track"></div>';
    lyricsTrack = document.getElementById("lyrics-track");
    appState.lyrics = [];
    appState.currentLyricIndex = -1;
    if (!song.hasLyrics) {
      lyricsTrack.innerHTML = `<p class="lyric-line active" style="font-weight: 500;">暂无歌词</p>`;
      return;
    }
    try {
      const response = await fetch(`media/songs/${song.id}/lyrics.lrc`);
      const lrcText = await response.text();
      appState.lyrics = parseLRC(lrcText);
      renderLyrics();
      updateLyrics(0, true);
    } catch (error) {
      console.error("加载歌词失败:", error);
      lyricsTrack.innerHTML = `<p class="lyric-line active" style="font-weight: 500;">歌词加载失败</p>`;
    }
  }
  function parseLRC(lrcText) {
    const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;
    const lines = lrcText.split("\n");
    const result = [];
    for (const line of lines) {
      const match = line.match(regex);
      if (match) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const milliseconds = parseInt(match[3].padEnd(3, "0"), 10);
        const time = minutes * 60 + seconds + milliseconds / 1000;
        const text = match[4].trim();
        if (text) result.push({ time, text });
      }
    }
    return result.sort((a, b) => a.time - b.time);
  }
  function renderLyrics() {
    if (!lyricsTrack) return;
    lyricsTrack.innerHTML = appState.lyrics
      .map(
        (line, index) =>
          `<p class="lyric-line" data-index="${index}">${line.text}</p>`,
      )
      .join("");
    lyricsTrack.querySelectorAll(".lyric-line").forEach((lineEl) => {
      lineEl.addEventListener("click", () => {
        const index = parseInt(lineEl.dataset.index, 10);
        audioPlayer.currentTime = appState.lyrics[index].time;
      });
    });
  }
  function updateLyrics(currentTime, forceUpdate = false) {
    if (!appState.lyrics.length || !lyricsTrack) return;
    let newIndex = -1;
    for (let i = 0; i < appState.lyrics.length; i++) {
      if (currentTime >= appState.lyrics[i].time) {
        newIndex = i;
      } else {
        break;
      }
    }
    if (newIndex !== appState.currentLyricIndex || forceUpdate) {
      const oldIndex = appState.currentLyricIndex;
      appState.currentLyricIndex = newIndex;
      const allLines = lyricsTrack.querySelectorAll(".lyric-line");
      if (allLines[oldIndex]) allLines[oldIndex].classList.remove("active");
      if (allLines[newIndex]) allLines[newIndex].classList.add("active");
      allLines.forEach((line, index) => {
        line.classList.toggle("played", index < newIndex - 1);
      });
      setTimeout(() => {
        const newLine = allLines[newIndex];
        if (newLine) {
          const containerHeight = lyricsContainer.clientHeight;
          const lineTop = newLine.offsetTop;
          const lineHeight = newLine.clientHeight;
          const scrollTarget = -lineTop + containerHeight / 2 - lineHeight / 2;
          lyricsTrack.style.transform = `translateY(${scrollTarget}px)`;
        }
      }, 50);
    }
  }
  function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs < 10 ? "0" : ""}${secs}`;
  }

  function setupEventListeners() {
    window.addEventListener("hashchange", handleRouting);
    window.addEventListener("beforeunload", saveStateToCache);

    closePlayerBtn.addEventListener("click", hideFullScreenPlayer);
    playPauseBtn.addEventListener("click", togglePlayPause);
    miniPlayerPlayPause.addEventListener("click", togglePlayPause);
    miniPlayerArtwork.addEventListener("click", showFullScreenPlayer);
    miniPlayerInfo.addEventListener("click", showFullScreenPlayer);
    miniPlayerNext.addEventListener("click", playNext);
    miniPlayerPrev.addEventListener("click", playPrev);
    miniPlayerQueue.addEventListener("click", showPlaylistView);
    prevBtn.addEventListener("click", playPrev);
    nextBtn.addEventListener("click", playNext);
    queueBtn.addEventListener("click", showPlaylistView);
    closePlaylistBtn.addEventListener("click", hidePlaylistView);
    searchInput.addEventListener("input", handleSearch);

    modeBtnNormal.addEventListener("click", () => setMode("normal"));
    modeBtnShare.addEventListener("click", (e) => {
      setMode("share");
      playRippleAnimation(e);
    });
    generatePlaylistBtn.addEventListener("click", generateAndCopyShareUrl);

    closeEditPlaylistModalBtn.addEventListener("click", closeEditPlaylistModal);
    editPlaylistModal.addEventListener("click", (e) => {
      if (e.target === editPlaylistModal) closeEditPlaylistModal();
    });
    editPlaylistCoverInput.addEventListener("change", handleCoverFileSelect);
    savePlaylistChangesBtn.addEventListener("click", savePlaylistChanges);

    audioPlayer.addEventListener("play", () => {
      updatePlayPauseButtons(true);
      if (!audioContext) setupVisualizer();
      if (audioContext && audioContext.state === "suspended")
        audioContext.resume();
      startVisualizer();
    });
    audioPlayer.addEventListener("pause", () => {
      updatePlayPauseButtons(false);
      stopVisualizer();
    });
    audioPlayer.addEventListener("ended", () => {
      stopVisualizer();
      playNext();
    });
    audioPlayer.addEventListener("timeupdate", () => {
      const { duration, currentTime } = audioPlayer;
      if (duration && appState.currentSong) {
        progressBar.style.width = `${(currentTime / duration) * 100}%`;
        currentTimeEl.textContent = formatTime(currentTime);
        durationEl.textContent = formatTime(duration);
        updateLyrics(currentTime);
      }
    });
    progressContainer.addEventListener("click", (e) => {
      const rect = progressContainer.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const width = rect.width;
      audioPlayer.currentTime = (clickX / width) * audioPlayer.duration;
    });

    closeDownloadModalBtn.addEventListener("click", closeDownloadModal);
    downloadModal.addEventListener("click", (e) => {
      if (e.target === downloadModal) closeDownloadModal();
    });

    window.addEventListener("resize", () => {
      if (visualizerFrameId !== null) {
        stopVisualizer();
        startVisualizer();
      }
    });
  }
  init();
});
