# Belt, outer clouds and seed admission

## Compare the two owner options

[DEMONSTRATED: S8 `pass-table.json`] At a fixed 3,960 s main burn, even a 1,570 km pass exits at about 50.90 m/s. A 1,660 km pass fails that particular family's speed gate, but other burn epochs can succeed farther out. A belt ending at 1,660 km is therefore not a demonstrated universal corral.

[DEMONSTRATED: 2G handoff, belt study; S8 `ring.json`] The existing prograde ring is stable enough for a run around 700–860 km; 2G's outer-orbit experiments become unstable beyond roughly 900 km. S8 independently finds breathing, losses and an extended tail even for the present distribution. Rocks must continue to obey P4. Do not freeze an enlarged torus in place or respawn rocks around the ship.

| Option | Quantified cost and limitation | Recommendation |
| --- | --- | --- |
| Widen rocks, preserving present area density | 700–1,660 km needs 2,905 rocks; 700–1,800 km needs 3,526; 700–2,600 km needs 8,039. All retain the original thin vertical distribution. Puffing up the belt costs still more; lifting can still bypass a thin ring | Reject for this release: unstable outer orbits, much larger moving-object cost, and no certified finite-width proof |
| Keep rocks; bank the outer assist with clouds | 320 Beta rocks + 16 Alpha rocks; one analytic field, including polar caps. Leaves the known 830 km corridor and its 3D clearance problem | Recommend, subject to owner approval of the explicitly fictional field and integration checks |

[ASSUMED, calculated] Counts use `ceil(320 * (R² − 700²) / (860² − 700²))`, with radii in km. This preserves initial surface number density, not collision probability after dynamical evolution. It is not a simulated success claim for a widened belt.

**S15 does not report a measured marginal frame cost per rock.** Its baseline predates the full 3D merge and contains no controlled rock-count sweep. Do not divide total frame time by rock count. [DEMONSTRATED: S15] Modest-profile 1× p95 spans 18.1–30.2 ms, with a 333.4 ms SYSTEMS hitch; ship ticks and continuing scene/layout work are material costs. A separate 2G timing comparison gives 27 ms/100,000 particle-only steps without rocks and 178 ms with 30 rocks. [ASSUMED: extrapolation] The difference is approximately **50.3 ns per rock per physics tick**, excluding sensing, collision, model, snapshots and drawing. An 8,039-rock ring adds about **0.389 ms/tick** over 320 by that crude slope. This is **not S15 frame cost** or a promise of linear scaling.

[ASSUMED] 2D/3E should measure fixed-camera identical-scene 320/640/1,280-rock cases, alternating order with repeated trials, both 1× and requested 2000×. Report elapsed physics work and rAF p95 separately; divide differences in measured mean CPU cost, never p95 quantiles, by added rocks. Repeat with clouds enabled/disabled. Retain A18's 2.5 s cold load, 33 ms p95, >100 ms investigation and actual modest laptop check. Cloud transparency/overdraw is unmeasured here.

## Exact recommended geometry

[ASSUMED] Preserve the original Beta distribution: **320** rocks, area-uniform initial radii **700–860 km**, prograde, tangential/radial fractional speed sigma **0.015**, vertical position sigma **0.006 r** and vertical velocity sigma **0.006 v_c**, rock radii log-uniform **3–12 km**. Surface density is `4.081e-4 rocks/km²`, about one rock per 2,450 km². Initial volume density is `Σ exp(−z²/(2σ²))/(sqrt(2π)σ)` with radius-dependent σ, not a sharp vertical wall. Keep the 16 Alpha rocks and the actual-arrival 60 km exclusion. Fixed catalogue phases preserve each rock's size and relative orbital elements (A10).

[DEMONSTRATED: S8] The time-sampled 5th–95th percentile Beta band is 652–994 km, with tails outside it. Those are percentiles, not containment bounds. Always propagate and sweep actual rocks. The reference uses a conservative **20 m** ship sphere plus **1 km** extra acceptance margin; deployed panels fit inside it. This extra kilometre is not a substitute for the model's navigation covariance.

[FICTIONAL; dimensions ASSUMED] Add a **co-rotating trailing crescent** attached to Beta's environment, not gravitationally orbiting material. In the binary's orbital frame, +x points from Alpha to Beta, +z is its orbit normal; negative azimuth is trailing. Let `q = ship_point − Beta(t)`, `r = |q|`, `rho = sqrt(qx²+qy²)`, and `a` be co-rotating azimuth in degrees, wrapped to [−180,180). With `S(u)=clamp(u,0,1)²(3−2 clamp(u,0,1))`:

```text
radial  = S((r − 1,000,000)/50,000) * S((2,600,000 − r)/200,000)
crescent = S((a + 90)/5) * S((−30 − a)/5)
caps     = S((0.2 − rho/r)/0.1)
I(q,t)   = 0.05 * radial * max(crescent, caps)
```

The crescent starts at **1,000 km**, reaches full radial intensity at **1,050 km**, stays full to **2,400 km**, and fades to zero at **2,600 km**. Azimuth support is **−90° to −30°**, full from **−85° to −35°**. The field spans elevation; it is not a few-kilometre disc that a small lift can evade. Two polar caps close the coordinate singularity: support begins at `rho/r < 0.2`, full below 0.1. Clouds remain finite; do not clamp the ship's position or veto a physically surviving path.

[ASSUMED] Render optically emissive banks with a distinguishable edge and depth. These clouds can be observed with the ordinary powered camera before committing to the assist. Their **visible appearance is itself fictional**; it is not a claim that ordinary radiation glows in vacuum. Do not reveal N03's invisible lattice or require its Black Box processing function here. Truth geometry is converted into acquired observations by the game/sensor layer; 2D and the model receive only measured patches, uncertainty and freshness.

## Exposure and failure

[FICTIONAL: P13, baseline `radiation`, A16 aggregation] For component `c`, integrate `D_c += susceptibility_c * max_{occupied component} I(x,t) dt`, including off equipment. Compact mounts retain the baseline point approximation; appendages sweep their entire moving geometry. 3C supplies raw exposure and threshold chronology; 3A applies susceptibility **once**. Use lattice-unit seconds, never Gy or Sv.

Reuse the baseline profiles unchanged: standard failure at accumulated 80, power-switch failure at 120 with susceptibility 0.8, hardened failure at 160 with susceptibility 0.5. Thus homogeneous raw exposure thresholds are **80 / 150 / 320** respectively. Existing upset/latch buckets, persistent condition, explicit resets and off-state accumulation still apply. Peak cloud intensity **0.05** is below every electronic instantaneous-burnout threshold: this is cumulative damage, not a scripted contact death. Passive hull/crew/tanks retain susceptibility zero. At sustained peak intensity, irreversible standard/PDU/hardened failure takes **26.7/50/106.7 minutes**. Earlier trips/upsets can remove service before those times.

[ASSUMED] Raw exposure 1 raises a caution; at peak it precedes the first standard upset bucket (6) by **100 s**. This is a last-resort contact cue, not the main opportunity to plan. The measured cloud boundary and a predicted intersection should warn during the hours-long approach, preferably before the departure burn. Show unresolved cloud extent as uncertainty. A12 drops warp on a new caution; it does not pause the encounter or silently restore warp. Already committed wide runs may need an abort/Recall and may forfeit the 16 m/s gate; do not promise every late cloud contact is recoverable.

## S8-style pass table

[DEMONSTRATED: `passes.json`, 120 s RK4 sampling] These are same-epoch-family counterfactual coasts with no rock or electrical interruption, so exit speeds on lethal rows are diagnostic, not achieved alive. Main burn is Alpha-relative prograde at 3,960 s. Raw cloud totals cover the whole coast to the first outward 9,000 km crossing.

| Beta periapsis km | Main Δv m/s | Ghost exit m/s | Raw exposure | Physical outcome |
| ---: | ---: | ---: | ---: | --- |
| 680 | 13.60185 | 49.042 | 0 | Below gate before rock/power checks |
| 830 | 13.79710 | 63.772 | 0 | Useful corridor; rocks still require tracking/clearance |
| 980 | 13.99800 | 66.313 | 178.44 | Both PDUs irreversibly fail by 32.75 h; retire the old nominal route |
| 1,120 | 14.19650 | 64.390 | 1,209.79 | PDU threshold by 29.07 h |
| 1,250 | 14.39467 | 61.013 | 1,733.08 | PDU threshold by 29.37 h |
| 1,400 | 14.64505 | 56.366 | 2,384.26 | PDU threshold by 29.77 h |
| 1,570 | 14.96446 | 50.896 | 1,969.29 | PDU threshold by 30.33 h |
| 1,660 | 15.15197 | 48.078 | 1,701.59 | Cloud loss and below gate |
| 3,009.586, separate outer control | 16, at 46,800 s | 38.861 | 0 | Fails gate by 11.139 m/s |

[DEMONSTRATED: `grid.json`, `verification.json`] The wider screen comprises S8's **689** prograde controls (53 epochs 0–62,400 s, 13 magnitudes 10–16 m/s), propagated to first outward gate/body contact or 160 h, plus **54** budget-admissible 3D variants: main magnitudes 13.8–15.5 from the declared list, ±1/±2 m/s z trims at 3,960, 39,600 or 79,200 s. It yields 314 exits, 73 meeting speed, and 38 wide speed-qualified routes (periapsis ≥1,100 km), all with raw exposure ≥1,217.30. All exceed PDU failure by a large margin. The 223 exits remaining outside 2,600 km peak at 38.861 m/s. Frozen-source, energy-powered escape and infinite-time/multi-burn searches are not claimed.

## Informed and blind threading

[DEMONSTRATED: `ring.json`] The fixed 8008 reference layout is rotated about Beta through **12 phases**, 0°,30°,…,330°. Alpha's 16 rocks remain in place. Sweep all 336 rocks to each route's own exit, not just the first crossing. All rock sizes are unchanged.

| Control, same 830 km main burn | Collisions / 12 | ≥1 km clearance / 12 | Minimum surface clearance |
| --- | ---: | ---: | ---: |
| Blind planar coast | 4 | 4 | −6.038 km |
| Measured-safe +1 m/s lift at 80,040 s | 0 | 12 | 6.385 km |
| Blindly choose −1 m/s lift instead | 2 | 9 | −1.781 km |

The four planar collisions have first same-rock 20 km cues **1,200, 840, 1,560 and 1,200 s** before contact (120 s sampling; worst conservative lead at least 600 s). These are geometric warning opportunities, not proof the real camera acquired each object. Contact recorders retain the rock ID, approach and first failure. No death count unlocks success. A blind pass can survive; do not add a punishment flag to force it to fail.

[DEMONSTRATED: `vectors.json`, `robustness.json`] The exported informed thread uses main **13.797104407 m/s at 3,960 s**, followed by **+1 m/s inertial z at 80,040 s**. It crosses the belt's radial field above the moving local rocks, rather than taking the exterior weak-assist route. It costs 133.249 kg main and 14.014 kg translational RCS in the ideal mass ledger, leaving **1.202896 m/s** under the current cap. Attitude-control consumption is additional. The closest rock clears by 6,384.714 m; the cloud-support lower bound at samples exceeds 53 km. Nine nearby controls retain ≥1.307 km rock clearance. Continuous points between tested controls are not certified.

Finite main thrust is **5,850 N** (quarter throttle, current 0.975 calibration), over 3,924.260–3,995.740 s; lift is **750 N** over 80,019.844–80,060.156 s. Fixed inertial thrust, gravity and changing mass give a safe complete-field route. This confirms a finite-force translation solution, not roll-held controller/input performance. 2F must adapt the delivered impulse to measured engine calibration and orient the body-frame RCS correctly.

[DEMONSTRATED: `robustness.json.manual_neighborhood`] A more forgiving manual authoring fixture uses the same rock sizes/elements at **150° ring phase**. All nine combinations of **±60 s** main timing and **±0.05 m/s** delivered impulse clear by **3.282–26.481 km**, retain zero cloud exposure and exit at **59.679–65.712 m/s**. Its nominal gap is 24.573 km. This is a second explicit layout, not a claim that the phase-0 layout has the same wider tolerance or that all input devices attain it. The phase-150 Cartesian states are in `ring.json`.

## S8 seed rules still apply

[ASSUMED] Retain all six S8 rejection rules: invariant law/masses/sizes/separation, actual incoming state, initial exclusion and swept observation interval, a witness for every required task, multiple safe controls/reserves, and observable wrong-law mismatch with recovery time. Save the seed and briefing. Do not randomize initial rock sizes, invent fresh fuel, or reset C01's arriving ship. S8's low-orbit-versus-16 m/s conflict is unchanged and remains an owner decision.

[DEMONSTRATED: `catalogue.json`] At offsets −15°,−10°,−5°,0°,5°,10°,15°, keep S8's main epochs and reduce each main impulse by 0.2 m/s; adapt the lift epoch from its pass estimate. Complete-field nominal clearances are **6.059–20.113 km**, exit speeds **60.912–64.998 m/s**, and elapsed times **65.133–71.733 h**. All have zero cloud exposure and arrival surface gaps over 306 km. `catalogue-neighborhoods.json` records nine nearby controls per offset and retains only those with ≥1 km clearance, qualifying speed/budget and zero exposure. This is one layout per offset, not the cross-product with the 12-phase experiment.

| Offset | Accepted controls / 9 | Minimum accepted clearance km | Accepted exit speeds m/s |
| ---: | ---: | ---: | ---: |
| −15° | 9 | 4.796 | 58.226–62.826 |
| −10° | 8 | 1.604 | 61.817–64.283 |
| −5° | 9 | 4.044 | 59.820–63.751 |
| 0° | 9 | 1.926 | 62.213–65.037 |
| +5° | 9 | 3.262 | 61.685–64.801 |
| +10° | 9 | 8.349 | 63.672–65.867 |
| +15° | 9 | 10.630 | 63.529–65.818 |

All seven have multiple passing controls; **62/63**, not 63/63, meet the extra kilometre certificate. Do not treat the failed −10° perturbation as admitted or infer continuous safety between samples.

[DEMONSTRATED: `catalogue.json`] Four coherent binary/ship rotations per offset, with the **sun left fixed**, produce 28 manual-power cases: zero power losses and >25 h remaining dark endurance. Clouds must rotate with the binary's axes, not with the screen or camera. These rotations preserve gravity/rock clearance; optical coverage and noise still need the production test. The old 980 km routes are **not** grandfathered into the new cloud geometry. Reject untested layouts rather than weakening S8's criteria. Old wrong-law warning evidence remains conditional on fresh measurements, not a substitute for testing the actual display.
