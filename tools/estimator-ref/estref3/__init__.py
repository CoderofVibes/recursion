"""Three-dimensional estimator reference (spec revision 3, DECISIONS A11).

A parallel package beside the planar `estref`: the planar package is left
untouched so the nine planar vectors regenerate bit for bit. Pieces that do not
depend on dimension are imported from `estref` (the Levenberg-Marquardt solver,
the calibration profile, the earned hedge, aging, JSON formatting)."""
