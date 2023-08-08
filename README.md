![build](https://github.com/WonderlandEngine/wonderland-engine-examples/actions/workflows/github-pages.yml/badge.svg)

# Wonderland Spatial Audio

Welcome to Wonderland Spatial Audio, a set of spatial audio components
designed for use with Wonderland Engine.
This library incorporates Kemar measurements obtained by MIT, providing
you with an immersive and more realistic 3D sound experience.

## How to Use

### Integration of HRTF Measurements:

Copy the HRTF measurements binary file from `wonderland-spatial-audio/example/static/hrtf_128.bin`
and place it into your project's `static` folder.
These measurements are essential for accurate sound localization based on
individual listener differences.

### Setting Up the Listener:

Add the `listener` component to the Player Head object. This ensures
correct receiver positioning.

### Defining Audio Sources:

To create dynamic and realistic sound sources, add the audio-source
component to the objects from which the sound is supposed to emanate.
In the component, specify the location of the audio file and set the
maximum allowed volume of the source (ranging from 0 to 1, where 1
represents 100%).

## Current Considerations

### Meta Quest 2 Performance

Please note that on the Meta Quest 2, the maximum number of simultaneously
playing audio sources is approximately 30.

Keep this in mind while designing your audio scenes to ensure an optimal
auditory experience for your users.

Explore the possibilities of Wonderland Spatial Audio and bring your
virtual world to life with rich, lifelike soundscapes.

The measurements were obtained from [MIT's Sound Media website](https://sound.media.mit.edu/resources/KEMAR/).

Happy immersive audio designing!
