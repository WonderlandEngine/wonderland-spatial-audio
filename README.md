![build](https://github.com/WonderlandEngine/wonderland-spatial-audio/actions/workflows/github-pages.yml/badge.svg)

# Wonderland Spatial Audio

[NPM Package](https://www.npmjs.com/package/@wonderlandengine/spatial-audio)

The Wonderland Audio System simplifies audio management with
[Wonderland Engine](https://wonderlandengine.com). These components offer efficient control
over audio sources and listeners and enable seamless updates of their positions and
orientations in the [WebAudio](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) context.

[View Live Example](https://wonderlandengine.github.io/wonderland-spatial-audio/)

[View Documentation](https://wonderlandengine.github.io/wonderland-spatial-audio/docs/)


## Usage Guide

Instructions on how to set up and use Wonderland Spatial Audio:

### Installation

Install the components in your project:

```sh
npm install --save @wonderlandengine/spatial-audio
```

Wonderland Editor will automatically detect the components from this package and they will
be available to attach to objects.

### Audio Listener

1. For VR audio: attach an `audio-listener` component to the `Player > Head` object.
   This controls position and orientation of the receiver. Updates occur each frame.

2. For PC/mobile audio: attach the `audio-listener` component to the `NonVrCamera`.
   Only one listener component should be active at any given time. To achieve this, use
   the `vr-mode-active-switch` component.

 ⚠️  The listener is necessary for spatial panning to work correctly in the `AudioManager` and `AudioSource`!

### Audio Sources

Add an `audio-source` component to objects that should play sound. Set the `src`
property to a URL in the `static` folder of your project.
(E.g., for `static/sfx/sound.mp3` enter `sfx/sound.mp3`).
If `spatial` is set to `None`, all settings below are ignored.

- Changing the `volume` parameter will only take effect when calling the `play()` function. If the audio is already 
  playing, use `setVolumeDuringPlayback()` instead.

### AudioManager

The `AudioManager` can be used to play audio from anywhere in your project! It is a way to conveniently 
manage audio files. This package provides a global instance of the manager called `globalAudioManager`. 
To make use of it, create your own identifiers and then load up the manager with your audio files:

```js
enum MySounds {
    Gunshot,
    Zombie,
}

globalAudioManager.load('sfx/gunshot.mp3', MySounds.Gunshot);
// You can even load multiple files for one ID. On play, a random file of the provided ones will be selected. 
globalAudioManager.load(['sfx/zombie_01.mp3', 'sfx/zombie_02.mp3'], MySounds.Zombie);
```
⚠️ Only load() and loadBatch() can be used in top-level code!

There are two ways of playing an audio file that has loaded:

```js
globalAudioManager.play(MySounds.Gunshot);          // Standard way, returns an ID with which audio can be stopped or paused.
globalAudioManager.autoplay(MySounds.Gunshot);      // Plays the audio as soon as the user has interacted with the site.
```

Checkout the `PlayConfig` type, for all the configuration settings! It can be added to change the playback behaviour.

```js
onPress() {
    this.object.getPositionWorld(posVec);
    globalAudioManager.play(MySounds.Gunshot, {
        volume: 0.8,
        loop: true,
        position: posVec,
        channel: AudioChannel.Sfx,
        priority: false
    });
}
```

The `AudioManager` has three main channels: Sfx, Music and Master. Use these to group your audio and 
control the volume globally. On using `play()`, the respective channels can be selected via the `PlayConfig`. 

## Considerations

### Best Practices

- **HRTF Performance:** The `HRTF` setting demands substantial performance resources.
  For less critical audio effects, consider deactivating it and rely on regular
  (equal-power) 3D panning.

- **Stationary Audio Sources:** If an `audio-source` in a scene will remain at the same
  position, activate the `isStationary` flag to disable position updates each frame for
  better performance.

### Meta Quest 2 Performance

On Meta Quest 2, the maximum number of simultaneously playing audio sources is
approximately 30.
