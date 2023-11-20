![build](https://github.com/WonderlandEngine/wonderland-engine-examples/actions/workflows/github-pages.yml/badge.svg)

# Wonderland Spatial Audio

The Wonderland Audio System simplifies audio management with
[Wonderland Engine](https://wonderlandengine.com). These components offer efficient control
over audio sources and listeners and enable seamless updates of their positions and
orientations in the [WebAudio](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) context.

[View Live Example](https://wonderlandengine.github.io/wonderland-spatial-audio/)

## Usage Guide

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

2. For desktop audio: attach the `audio-listener` component to the `NonVrCamera`.
   Only one listener component should be active at any given time. To achieve this, use
   the `vr-mode-active-switch` component.

### Audio Sources

Add an `audio-source` component to objects that should play sound. Set the `src`
property to a URL in the `static` folder of your project.
(E.g., for `static/sfx/sound.mp3` enter `sfx/sound.mp3`).
If `spatial` is set to `none`, all settings below that are ignored.

## Considerations

### Best Practices

- **HRTF Performance:** The `HRTF` setting demands substantial performance resources.
  For less critical audio effects, consider deactivating it and rely on regular
  (equal-power) 3D panning.

- **Stationary Audio Sources:** If an audio source in a scene will remain at the same
  position, activate the `isStationary` flag to disable position updates each frame for
  better performance.

### Meta Quest 2 Performance

On Meta Quest 2, the maximum number of simultaneously playing audio sources is
approximately 30.
