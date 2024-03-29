![build](https://github.com/WonderlandEngine/wonderland-engine-examples/actions/workflows/github-pages.yml/badge.svg)

# Wonderland Spatial Audio

[NPM Package](https://www.npmjs.com/package/@wonderlandengine/spatial-audio)

The Wonderland Audio System simplifies audio management with
[Wonderland Engine](https://wonderlandengine.com). These components offer efficient control
over audio sources and listeners and enable seamless updates of their positions and
orientations in the [WebAudio](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) context.

[View Live Example](https://wonderlandengine.github.io/wonderland-spatial-audio/)


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

### Audio Sources

Add an `audio-source` component to objects that should play sound. Set the `src`
property to a URL in the `static` folder of your project.
(E.g., for `static/sfx/sound.mp3` enter `sfx/sound.mp3`).
If `spatial` is set to `none`, all settings below are ignored.

### AudioManager

```js
// Load your audio on start(), so it is ready when you need it.
start() {
    globalAudioManager.load('audio.mp3').then((playableNode) => {
        this.audio = playableNode;
    });
}

// Play the file when you need it.
onClick() {
    // Plays the audio without panning
    this.audio.play(); 

    const position = new Float32Array(3);
    this.object.getPositionWorld(position);
    // Plays from specified position relative to audio-listener
    this.audio.play(position);
}

// Free up the resources, if audio is not needed anymore.
this.audio.destroy();
```

1. Instantiate a playable audio node by invoking the `load()` method of the `AudioManager` class. This method 
   returns a promise that resolves to an audio node upon successful loading of the audio resource. You can create 
   your own `AudioManager`, per scene for example, but `wonderland-spatial-audio` also provides a `globalAudioManager`.

2. The `play()` method initiates the playback of the audio node. For spatialized audio playback, supply the `play()` method with a position argument in the form `play(pos)`.

3. Each audio node instance exposes several properties for advanced configuration:

```js
/* The 'volume' property controls the amplitude of the audio output. */
this.audio.volume = 0.5;

/* The 'HRTF' property, when set to true, enables full HRTF (Head-Related Transfer Function) spatialization,
 * as opposed to standard panning, for better immersion. */
this.audio.HRTF = true;

/* The 'loop' property, when set to true, causes the audio to repeat indefinitely. */
this.audio.loop = true;
```

4. The `destroy()` method deallocates the resources associated with the audio node, effectively removing it from memory.

:warning: As these AudioNodes only play from the specified position, use `audio-source` for any moving objects that
emmit sound. 

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
