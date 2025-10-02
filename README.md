# MusicPlayer [![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC_BY--NC--SA_4.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)
完全基于前端实现的歌曲播放器。

### 组织架构

```
MusicPlayer/
│   index.html    // 首页
│   app.js    // 全站逻辑
|   style.css    // 样式
|   admin.html    // 管理后台
│
└───data/
│   │   favicon.ico    // logo
│   │   notfound.png    // 无封面时替代封面
|   |   music-list.json  // 歌曲配置存储
│   └───*.ttf/*.otf    // 字体系列
│   
└───media/
     |   albums/
     |   └───(albumsID)/    // 以专辑ID命名的文件夹
     |        └───cover.jpg    // 封面
     └───song/
         └───(songID)/    // 以歌曲ID命名的文件夹
              |   DD.mp4    // 杜比全景声（EAC3JOC）
              |   DDB.wav    // 杜比双耳
              |   ORI.flac    // 原曲
              |   lyrics.lrc    // 歌词
              └───cover.jpg    // 封面
```

### 食用方法

在首次使用时，
1. 通过网络服务打开 `admin.html`；
2. 根据页面配置阿里云储存桶（如需兼容其他储存桶请自行二开）；
3. 登入后根据页面配置即可；
4. 配置完成后通过网络服务打开 `index.html` 或将源码传至储存桶开放静态页面访问。

后续使用直接访问储存桶即可。

** 也可以不通过储存桶配置项目，下文将介绍本项目中是如何存储歌曲信息的以及如何不通过 `admin.html` 新增曲目。

### 本项目是如何存储专辑、歌曲信息的？

本项目是通过 `data/music-list.json` 存储专辑、歌曲信息的。

如下：
```json
{
  "albums": [  // 专辑
    {
      "id": "SKYDRIVE",  // 专辑ID
      "songs": [  // 歌曲列表，每个歌曲ID用 , 隔开
        "Skydrive"
      ],
      "title": "Skydrive",  // 专辑标题
      "artist": "PIKASONIC",  // 专辑艺术家
      "hasArtwork": true  // 是否有封面
    }
  ],
  "songs": [
    {
      "id": "Skydive",  // 歌曲ID
      "title": "Skydive",  // 歌曲标题
      "artist": "PIKASONIC",  // 歌曲艺术家
      "album": "SKYDRIVE",  // 所属专辑
      "hasArtwork": true,  // 是否有封面
      "hasLyrics": true,  // 是否有歌词
      "availableFiles": {  // 音频流
        "eac3joc": {  // 杜比全景声
          "exists": true
        },
        "binaural": {  // 杜比双耳
          "exists": true
        },
        "original": {  // CD/HiRes原音频
          "exists": true,
          "metadata": {
            "codec": "ALAC",
            "bitDepth": "24 bit",
            "sampleRate": "48 kHz",
            "quality": "Hi-Res"
          }
        }
      },
      "bv": "BV19z4y1w73f",  // bilibili视频
      "buy": "https://music.apple.com/cn/album/skydive/1713393674"  // 歌曲购买链接
    }
  ]
}
```

### 如何不通过 `admin.html` 添加曲目

1. 根据上述 `music-list.json` 配置歌曲信息；
2. 根据文件夹组织架构配置音频流、歌词、封面等。
