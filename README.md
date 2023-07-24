# wonderland-spatial-audio
Welcome to Wonderland Spatial Audio, a set of spatial audio components designed for use with Wonderland Engine. This library incorporates Kemar measurements obtained by MIT, providing you with an immersive and more realistic 3D sound experience.

## How to Use

1. ### Integration of HRTF Measurements:
    Copy the HRTF measurements binary file from `wonderland-spatial-audio/example/static/hrtf_128.bin` and place it into your project's `static` folder. These measurements are essential for accurate sound localization based on individual listener differences.

2. ### Setting Up the Listener:
   Add the `listener` component to the Player Head object. This ensures correct receiver positioning.

3. ### Defining Audio Sources:
    To create dynamic and realistic sound sources, add the audio-source component to the objects from which the sound is supposed to emanate. In the component, specify the location of the audio file and set the maximum allowed volume of the source (ranging from 0 to 1, where 1 represents 100%).

## Current Considerations

- ### Oculus Quest 2 Compatibility:
    Please note that on the Oculus Quest 2, the maximum number of simultaneous audio sources playing is approximately 30. Keep this in mind while designing your audio scenes to ensure an optimal auditory experience for your users.

Explore the possibilities of Wonderland Spatial Audio and bring your virtual world to life with rich, lifelike soundscapes. The measurements were obtained from [MIT's Sound Media website](https://sound.media.mit.edu/resources/KEMAR/).

Happy immersive audio designing!
