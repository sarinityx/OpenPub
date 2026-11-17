# Test data

`publisher/` holds the Publisher sample files from the Apache POI project (`test-data/publisher` in https://github.com/apache/poi), unchanged. Apache POI is licensed under the Apache License 2.0.

- `Sample*.pub`, `Simple.pub`, `LinkAt*.pub`, `51318.pub`, `60685.pub` – used by the tests and `npm run test:parser`.
- `Sample98.pub`, `Sample2000.pub` – old formats; OpenPub must reject them with a clear message.
- `clusterfuzz-*.pub` – malformed files from fuzzing. Not used by the tests yet; useful for checking that the parser fails cleanly.
- `*.txt` – POI's expected text for the matching sample.

None of the samples has master-page objects, multi-column text boxes or EMF pictures, so those import paths are untested on real files.
