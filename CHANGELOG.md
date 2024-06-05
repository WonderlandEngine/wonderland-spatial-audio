# Changelog

## v1.3.0 - 2024-06-05
### Added
* New functions `pause()`, `pauseAll()` with `resume()` and `resumeAll()` which pause / resume a single source or all source respectively.
* Internal refactor, that makes managing of audio players more efficient and results in deprecation of `OneShotPlayers`. 

### Deprecations
* Deprecated `playOneShot()` in favor of `play()`.
* Deprecated `stopAllOneShots()` in favor of `stopAll()`.
* Changed `stop(sourceId, playId)` to `stop(playId)`, which stops the given id without the need of adding the source ID. Please update your code accordingly.
