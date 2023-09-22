![build](https://github.com/WonderlandEngine/wonderland-engine-examples/actions/workflows/github-pages.yml/badge.svg)

# Wonderland Spatial Audio

The Wonderland Audio System simplifies audio management within the Wonderland Engine, offering efficient control over audio sources and listeners while enabling seamless updates of their positions and orientations in the WebAudio context.

## Usage Guide

### Setting Up the AudioListener Component

1. Attach the `audio-listener` component to the `Player > Head` object. This ensures precise receiver positioning, with updates occurring each frame.

2. For testing spatial audio on your computer, attach the `audio-listener` component to the `NonVrCamera`. Only one `AudioListener` component should be active at any given time.

### Defining Audio Sources

- To create dynamic and realistic sound sources, add the `audio-source` component to objects from which sound should be played. Set the audioFile property to a file in the `static` folder of your project (For `static/sfx/sound.mp3` enter `sfx/sound.mp3`).
 
## Considerations

### Best Practices

- **HRTF Performance:** The `HRTF` setting demands substantial performance resources. For less critical audio effects, consider deactivating it and rely on regular (equal-power) 3D panning.

- **Stationary Audio Sources:** If an audio source in a scene will remain at the same position, activate the `isStationary` flag to disable position updates each frame for better performance.
### Meta Quest 2 Performance

On Meta Quest 2, the maximum number of simultaneously playing audio sources is approximately 30.