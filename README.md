![build](https://github.com/WonderlandEngine/wonderland-engine-examples/actions/workflows/github-pages.yml/badge.svg)

# Wonderland Audio System

The Wonderland Audio System simplifies audio management within the Wonderland Engine, offering efficient control over audio sources and listeners while enabling seamless updates of their positions and orientations in the WebAudio context.

## Usage Guide

### Setting Up the WlListener Component

1. Attach the `wl-listener` component to the Player Head object. This ensures precise receiver positioning, with updates occurring each frame.

2. For testing spatial audio on your computer, attach the `wl-listener` component to the `NonVrCamera`. It's important to note that there should always be only one active `WlListener` component.

### Defining Audio Sources

- To create dynamic and realistic sound sources, add the `wl-audio-source` component to objects from which the sound is meant to emanate. Define the path to your audio file which should be located in the `static` folder of your project.

## Considerations

### Best Practices

- **HRTF Performance:** The `HRTF` setting demands substantial performance resources. For less critical audio effects, consider deactivating it and rely on regular (equal-power) 3D panning.

- **Stationary Audio Sources:** If you are certain that the position of an audio source in a scene will remain constant, activate the `isStationary` flag. This optimization disables position updates each frame, conserving performance resources.

### Meta Quest 2 Performance

Please be aware that on the Meta Quest 2, the maximum number of simultaneously playing audio sources is approximately limited to 30.
