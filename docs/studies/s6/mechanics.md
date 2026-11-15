# S6 — A finite moving seam

[ASSUMED] Proposed mathematics for system X, pending owner/integrator approval. The rule is a Newtonian game construction, **not a solution of general relativity or a claim that traversable wormholes exist**. Labels apply to the equations and tables they introduce. SI units throughout; all spatial quantities are three-dimensional. [Play and implementation](play-and-build.md) specifies evidence, screens, scope and owner decisions. [The reference](../../../tools/studies/s6/reference.py) checks the bounded cases listed in [README](README.md).

## 1. The recommended fiction

[FICTIONAL] Two equal circular disks join two local spaces at the same simulation time. The mouth frames have independent, prescribed smooth motion. A proper rigid map identifies corresponding points and directions; the mouth mechanism exchanges momentum and energy with crossing matter. Each material portion feels the ordinary local forces in the space it presently occupies. Gravity does **not** take the shortcut through the empty aperture. Visible and other electromagnetic rays may take it, under the explicit optical approximation below.

[ASSUMED] Use constant aperture radius and repeated **alignment** windows. Turning edge-on, translating out of reach or passing behind a real occluder ends a useful window without deleting the aperture or cutting the ship by a timer. This is a proposed replacement for the older expedition's literal closure, not an already approved decision. If literal closure is chosen, a shrinking inner radius becomes an additional moving solid boundary: detect first contact and apply the same collision policy; never finish the transfer automatically or discard the far fragment. Do not allow the topology to disappear while occupied.

[ASSUMED] Author mouths with twice continuously differentiable position/orientation and analytic first/second derivatives. Constant angular velocity, sinusoids and fixed-axis periodic rotations suffice. No discontinuous frame jump or pose-only animation drives physics. Keep mouth motion externally prescribed, like a kinematic obstacle with an explicitly fictional work reservoir; this version does not simulate the machinery's mass, backreaction or power source. It can give or remove ship kinetic energy. It is not a free source of tank propellant, battery charge or heat removal.

[ASSUMED] One connected ship may engage only one pair at a time. No nested pair images or overlapping mouth swept volumes in this authored expedition. Validate separation against the largest allowed ship envelope and the actual exit scene; validate that permitted observation rays cannot encounter a second disk after the first. Do not silently black out a physically visible nested opening to enforce a rendering budget. Separate Petal pairs may show the same distant landmark without making an infinite recursive hall. A general portal network would need material traversal histories and recursive ray policies beyond this study.

[ASSUMED] Each pair has one saved phase epoch on the run's elapsed physical clock. Convert encounter-local times to that epoch before evaluating either mouth. Turning Rim and Passage are records/operations in the same continuing pair world: completing reconnaissance, loading its Passage briefing or crossing a domain boundary must not restart the cycle or resample its seed. Both local environments advance during a partial crossing. On recurrence A10 chooses the next run's authored phase/geometry; within a run the saved state resumes exactly.

## 2. Frames, position, velocity, attitude and spin

[ASSUMED] Mouth A has center `c_A`, rotation `Q_A` from mouth coordinates to chart A, center velocity `u_A`, acceleration `a_Ac`, chart-frame angular velocity `w_A` and angular acceleration `alpha_A`. Mouth B has analogous data in chart B. Each disk is `z=0, x²+y²<a²` in its own coordinates. `n_i=Q_i e_z` is its chosen front normal. Ship attitude `B` maps body to the current unfolded chart; ship spin `Omega` here is in that chart. The existing contract stores `omega_body=B^T Omega`, which is a different representation.

[FICTIONAL] For a front-to-front connection use the half-turn `D=diag(-1,1,-1)`, with determinant **+1**. Then:

```text
R = Q_B D Q_A^T
x_B = c_B + R (x_A - c_A)
Rdot = [w_B]x R - R [w_A]x
v_B = u_B + R (v_A-u_A) + Rdot (x_A-c_A)
    = u_B + w_B × (x_B-c_B)
      + R [v_A-u_A-w_A × (x_A-c_A)]
B_B = R B_A
Omega_B = w_B + R (Omega_A-w_A)
omega_body,B = B_B^T Omega_B
```

[ESTABLISHED: X01, X02] Differentiating a rotating position transform requires its rotation derivative in the velocity transform. NASA/JPL's state-transform and rotation references document that ordinary mathematical fact. [X01](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/cspice/sxform_c.html), [X02](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/rotation.html). [FICTIONAL] Using it to identify distant physical places is the invented part. A reflection of the normal alone has determinant −1 and cannot map a right-handed ship attitude by a quaternion; do not mirror the ship or change its handedness.

[FICTIONAL] At fixed time, relative speed measured against the **local material velocity of each mouth** is preserved. Inertial speed and inertial spin need not be. A centered stationary pair maps `v_B=R v_A`, `Omega_B=R Omega_A`; a translating or rotating pair contributes the additional terms above. Reverse traversal uses exactly the inverse map with A/B swapped and the same `D`; no extra half-turn or speed gain is applied. A two-sided disk also admits back-to-back traversal: retain the sign of the approach side, so the incoming and outgoing exterior sides are unambiguous.

[ASSUMED] Use the body's structural datum and current CoM correctly: for a body point `p`, unfolded position is `x_C+B(p-com_body)`. Its velocity includes `Omega × B(p-com_body)` and actual deployment velocity. Changes in mass/CoM do not move the structural hull as an accidental side effect. Rebase the position, velocity, attitude, body rate, chart-tagged pointing targets and active plan references together after the last occupied point clears. A rebase is bookkeeping; it does not consume propellant or trigger a second transport event.

[DEMONSTRATED: reference.py / moving_kinematics] Forward/inverse maps agree within 10⁻¹¹ SI in the fixture; finite differences check both the velocity and acceleration terms. The test has tilted axes, both translating mouths and unequal nonzero three-axis mouth spins. The JSON contains `R`, `Rdot`, `Rddot`, scalar-first attitude quaternions and both rate conventions. These tests cover the algebra, not a flight integrator with control inputs.

## 3. One ship, partly in each place

[FICTIONAL] Maintain one rigid **unfolded** body configuration, not two ships or two independently propagated half-ships. While entering from A, near material is at `x_A`; material that has crossed is at `c_B+R(x_A-c_A)`. Clip occupied hull meshes at the seam for geometry and rendering. The far fragment is rigid in B at each instant, with the different mapped angular velocity above. Internal constraints, wires, fuel lines and coolant lines remain connected in the sewn space. They do not become cables stretched across the ordinary separation between the mouths.

[ASSUMED] Begin transit state only at an actual inward disk intersection; ordinary flight outside the disk remains ordinary flight. The transit record carries pair ID, canonical chart, entry side, entry event, occupied-side state and deterministic event cursor. During a clear simple crossing, signed plane distance determines the split. That shortcut is valid only with the following provenance guard:

1. Start with the full connected transit envelope on one side.
2. Every point passing the seam must cross its interior, with a clear rim slab.
3. If any earlier appendage crossed the plane outside the disk, it is still in ordinary space. Do not map it just because the nose later reaches the hole.

[ASSUMED] Use the ship's conservative **connected convex transit envelope**, including appendages, their support struts and empty connecting gaps, to enforce those guards; exact union-of-prisms checks may refine it. Such conservative empty-space envelopes already exist in the baseline. If the current geometry cannot be represented as one clean split, retain per-part crossing provenance or reject that authoring/configuration before play. A completely off-disk bypass is valid; it is never a rim impact just because a plane was crossed. Retreat is allowed: crossed portions return through the same inverse map; clear all-near state releases the transit without a refill or reset.

### Forces during transit

[FICTIONAL] Let a material element have unfolded position `x`, velocity `v` and acceleration `a`, and mass `dm`. Differentiating the map gives:

```text
a_B = R a + k(x,v,t)
k = a_Bc - R a_Ac + 2 Rdot (v-u_A) + Rddot (x-c_A)
Rddot = ([alpha_B]x + [w_B]x²) R
        - 2 [w_B]x R [w_A]x
        + R ([w_A]x² - [alpha_A]x)
```

[FICTIONAL] The declared local Newton/seam law is: between individual material crossings, ordinary external forces plus ideal internal constraint forces give the local acceleration; at crossing, the seam supplies the prescribed mapped-velocity impulse. Pull virtual work back into A. A far-side force density contributes `R^T(dF_B-k dm)` to the unfolded dynamics; a near-side density contributes `dF_A`. With `r=x-x_C` and fixed mass distribution during this substep:

```text
F* = integral_near dF_A + integral_far R^T(dF_B-k dm)
tau* = integral_near r×dF_A + integral_far r×R^T(dF_B-k dm)
       + near pure couples + R^T far pure couples
M a_C = F*
I alpha = tau* - Omega × (I Omega)      # I expressed in unfolded chart
```

[FICTIONAL] This statement includes the seam's momentum flux. **Do not** differentiate an average such as `(1-f) M v_A + f M v_B` and omit the terms from crossing mass. Equally, simply averaging the two gravitational accelerations while ignoring `k` is wrong for rotating mouths. In the all-far limit the formula maps exactly to ordinary rigid-body dynamics in B; rebase and retire the A representation. In the all-near limit it is ordinary dynamics in A. A stationary equal-environment pair does no extra mechanical work except any specified potential offset at the seam.

[ASSUMED] Separate collision hull from mass distribution. Empty space inside a conservative prism has no mass. For a production ship, assign finite-volume density primitives to structural/component/tank masses, with intrinsic inertia and clipping that recovers the approved total mass, CoM and inertia. Integrate the polynomial rigid-motion `k` over clipped volumes, or use spatial quadrature with a stated convergence tolerance. Point equipment centroids alone produce abrupt force jumps as whole assemblies cross and cannot certify partial-body loads. The reference's eight symmetric point masses test general six-DOF algebra; its independent uniform-bar trajectory tests continuously changing far mass fraction. Neither is a replacement for the ship's density model.

[ASSUMED] Apply each delivered engine force **once**, at the nozzle's actual location and attitude in its physical side. Pull a B-side force/couple back by `R^T` before summing. Propellant flow, bus demand and onboard heat are computed once by the shared ship state; the seam does not multiply thrust. Near and far RCS jets can fire together. Use actual configuration motion for force arms, occupied volume and inertia. Preserve the existing variable-mass/deployment treatment in ship integration; the constant-mass equations above are the local substep limit, not permission to omit `I_dot`, internal configuration momentum or mass-flow effects where the ship model includes them.

[ASSUMED] Apply local gravity, thermal illumination, lattice exposure and any well's thrust modification at the relevant material/component/nozzle location, then transport the resulting force if necessary. For the first X build, author the mouth neighborhood and exit clear of wells/lattice, and forbid simultaneous field-boundary contact with the seam in content validation. This reduces coupled implementation risk while preserving the full-force rule. A retracted aft radiator may still cool on the near side while a forward array is illuminated through or beyond the opening. Retraction and jams retain their actual geometry; one heat/electrical ledger spans both sides.

[ASSUMED] An IMU is at a real point, not the fictitious unfolded CoM. It measures local nongravitational specific force, including constraint loads and any seam-crossing impulse; it does not report `-R^T k` as gravity. A gyro reports the rotation of its local piece relative to its local inertial chart. With two separated IMUs straddling, their different rates are valid data. Guidance uses a nominated physical control IMU/chart and converts the other measurements; it must not average incompatible chart rates. Local gravity remains inferred from tracking (P7). Do not change an inertial attitude target's physical meaning during rebasing or an artificial corrective burn will appear.

### Momentum and energy ledger

[FICTIONAL] The ship alone is not a closed system. For each element crossing, the reservoir supplies the change from `dm*v_A` to `dm*v_B`, after applying the declared chart identification; log vector quantities with their chart IDs. The scalar crossing work is the difference of local kinetic plus local potential energies. During finite transit, constraint reactions against a moving seam also exchange work. With source fields frozen and no thrust, the change in the sum of each portion's local `dm |v|²/2 + dm Phi` must be accounted for by the seam, not called integrator energy drift. With moving gravitating bodies, record their ordinary field work separately. Potential zeros must be fixed per domain so cross-domain potential offsets are well-defined.

[FICTIONAL] Real gravity assists (A6) exchange energy with a moving body under P4. A seam's prescribed kinematic reservoir is a separate fictional exchange; do not give the ship a second “slingshot bonus.” A repeated moving-pair loop can exchange net energy and this model does not claim otherwise. Bound mouth speeds and choose authored topology with no inexpensive useful cycle. A fixed law must not secretly penalize a clever reversible traversal because the player learned it.

## 4. Finite hull clearance and a solid rim

[ASSUMED] Recommend `a=6 m` as the initial Passage tuning candidate, with a 1 m radial rim width and 0.5 m axial half-depth. The deliberately spacious numerical fixture uses `a=12 m`, so its rim occupies `12<=rho<=13 m`, `|z|<=0.5 m`. Both mouths in a pair have congruent rim geometry. Petal uses a much smaller `a=0.75 m`; its ring thickness is content data. The aperture itself is the zero-thickness disk at `z=0`. Sweep all hull and appendage prisms, with actual deployment, through both local rim slabs. During transit, check only each side's occupied fragment against its own scene; never collide an unoccupied virtual image with an unrelated local object.

[ASSUMED] At a fixed time, clip each convex prism against the two rim slab planes. The projected clipped polytope has radial minimum and maximum `(rho_min,rho_max)`. It intersects the annulus exactly when `rho_min<=a+width` and `rho_max>=a`. Maximum radius occurs at a projected vertex; minimum radius is the distance to the projected convex hull (zero if it contains the origin). A vertex-only test of the original mesh misses edge/face intersections. For an active passage, hole margin is `a-rho_max`; before engagement, a prism entirely beyond the outer radius is a bypass, not negative-clearance collision.

[ASSUMED] Plane sections alone miss axial rim thickness and events between ticks. Production CCD must enclose the moving/deploying prism and rim over each interval, discard provably disjoint intervals, and subdivide unresolved intervals in fixed order. Use analytic motion bounds for vertex speed/acceleration and conservative convex distance bounds; bracket earliest contact, then refine. Include tangencies that do not flip a signed test. A practical proposed tolerance is `1e-4 s` event time and `1e-4 m` geometry near contact, with a conservative unresolved-contact report after bounded refinement. These are numerical tolerances, **not** damage radius inflation or uncertainty margins. Halving integration step and tolerances must converge the event/part. The reference isolates analytic event brackets; it does not implement a general certified rotating-prism CCD engine.

[ASSUMED] Main simulation ticks remain fixed (P2); schedule deterministic dyadic substeps around a seam and sort equal-time events by `(time, collision-before-transfer, pair ID, part ID, feature ID)`. Fixed iterations and explicit event times make replay independent of frame rate and warp. Process the force discontinuity at each crossing, prevent duplicate events with oriented side state, and carry unused tick time forward. A tangency with zero inward flux does not map the ship back and forth. No arbitrary epsilon “push through” grants free clearance.

### What a rim hit means

[ASSUMED] Recommend a conservative first version: **a confirmed load-bearing rim contact ends the run as structural loss**. This includes a positive-impulse impact and zero-speed contact that develops a positive squeezing reaction. It is an explicit failure-envelope approximation, not a scientific claim that every real spacecraft graze is fatal. Mere optical overlap, a forecast envelope touching the rim, a numerical tolerance tie, or unloaded tangency is not ship loss. At zero normal speed, evaluate the free second derivative of the contact gap, including rim rotation/acceleration: an inward value requires a contact reaction and is not harmless tangency. Preserve the first physical contact, component, local relative velocity and sensor-visible consequences. No bounce or automatic completion is performed after loss. The owner may instead fund recoverable component impacts; that needs damage thresholds, multi-contact constraints and surviving geometry/loads, not a random survival roll.

[ESTABLISHED: S14; elementary rigid-body impulse balance] For a frictionless inelastic single contact with outward normal `n` and negative relative normal point speed `v_n`, the diagnostic impulse is `J=-v_n/(1/M+(r×n)^T I^-1 (r×n))`. A far contact uses `n_A=R^T n_B` and the unfolded lever arm; use the **physical mapped contact-point velocity minus rim material velocity** for `v_n`. Applying `J n_A` to translation and `r×J n_A` to angular momentum gives zero post-impact normal speed in this single-contact limit. Dissipated relative normal energy is `J*(-v_n)/2`. The prescribed rim supplies reaction/work; the moving mouth must not be treated as a stationary world obstacle. [S14](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/torque-moment/) supports force moments; the stated impulse equation follows by applying linear/angular impulse balance, not a NASA damage rating.

[DEMONSTRATED: reference.py / clean_crossing, partial_rim_clip] The synthetic 16×5×5 m stowed box, centered and aligned at 1 m/s, has `12-sqrt(2.5²+2.5²)=8.464466 m` minimum hole margin. First material enters at 4 s and the last leaves at 20 s; the tail remains within the finite rim slab until 20.5 s. With a trailing radiator extending to `y=10 m` and ship offset `y=2.1 m`, first rim contact occurs at 13.5 s, after the nose and CoM cross but before the tail. The reference stops there; it does not simulate damage or infer an accelerometer waveform. These dimensions are an explicit fixture, not the final 3D ship mesh.

## 5. Gravity, sunlight and visible rays

[FICTIONAL] No **additional image-mass** force leaks through an empty opening. A far body seen through a petal does not pull an otherwise near-side ship toward the hole. Ordinary local sources still exert their ordinary domain field, including any body that is actually near enough by the ordinary route; do not disable its ordinary attraction merely because it is also visible through a pair. The rim has no authored gravity in this minimal version. This screening choice is independent of A3, which only excludes the distant lighting sun from the encounter gravity sum.

[FICTIONAL: P4] On the unfamiliar side, for each local body at `b`, use `a_g=-(mu/r0²)(r0/r)^2.5 (x-b)/r`, with one shared `r0=1,000,000 m`. On the far side of the **home** pair, recommend an explicitly separate Newtonian domain `a_g=-mu(x-b)/r³`; request owner approval rather than treating this as settled. Different laws act on different material portions while straddling; no CoM-triggered global gravity switch. The model needs evidence/assumption for that far domain and cannot quietly carry a confident inverse-2.5 Earth forecast. Local point-source potentials follow 1B: `Phi=-mu*r0^(p-2)/((p-1)*r^(p-1))`.

[ASSUMED] At 1,000 km from a `mu=1e10 m³/s²` source, P4 gives `0.01 m/s²`. Across a 16 m axial ship, leading radial differential acceleration is about `2.5*0.01*16/1e6=4e-7 m/s²`, giving only about `5.1e-5 m` differential displacement over 16 s under a frozen-gradient estimate. That ordinary tide is too small to sell as the Passage's dramatic hazard. Different environments across a seam, moving-rim geometry and available thrust are potentially much larger. The reference's `.01` and `-.02 m/s²` axial fields deliberately isolate that cross-domain effect; they are test fields, not fitted Earth gravity or an approved encounter.

[FICTIONAL] For a backward camera ray `x+s d`, find its nearest admissible disk intersection at `h_A`. Transport its origin and direction by:

```text
h_B = c_B + R (h_A-c_A)
d_B = R d_A
```

[ASSUMED] Check near occlusion before the disk, the solid rim, then far occlusion along `d_B`. If the ray misses the finite disk, it continues through ordinary near space. Perspective is obtained by transforming the camera and clipping to the exit plane; painting one remote screenshot on the disk fails parallax. A ray direction is **not a material velocity**: do not add `u_B-R u_A` or `Rdot` to `c_light*d`. Transport geometric direction, and in this simplified optics preserve radiance/spectrum without lens amplification. The mouth's ordinary illuminated texture can be visible; no unsupported beam glows in vacuum.

[ESTABLISHED: X03] Finite propagation time and observer motion distinguish an apparent observation from an instantaneous geometric one. [NASA/JPL aberration reference](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/abcorr.html). [ASSUMED] Recommend instantaneous **geometric** rendering and matching synthetic optical measurements for the first X build, with no Doppler, aberration, gravitational lensing or time offset across the seam. Label the approximation in author data and tests. At 200 m/s, `v/c≈6.7e-7 rad` is the aberration scale, below the current assumed camera's 0.00005 rad nominal angular noise; do not add it as player work. Local paths of 1 km give only 3.3 microseconds light time and under 0.7 mm motion at 200 m/s. The vector writes its actual path/error bound.

[ASSUMED] That bound does **not** justify instantaneous precise Earth tracking at long range: already for a `1e8 m` far ray (100,000 km), delay is about 0.334 s. Keep distant home observations qualitative/coarse under the declared approximation, or add retarded-ray timing before claiming precision navigation/contact. Do not use the ordinary separation of the mouths as the light path length: the shortcut joins them at one time; only each local ray leg contributes. This is a game approximation, not a loophole for time travel or superluminal messaging claims.

[ASSUMED] A3 sunlight is transported as the same finite, occluded ray bundle. Check shadows on both legs and integrate illuminated area on each array/radiator/room surface; do not illuminate the whole ship just because its CoM can see the disk. A sun through the hole may look like a second source direction without becoming a second gravitating sun. Total received power is limited by the aperture and geometric projected area; no uniform far-side ambient light appears outside the transmitted bundle. The prototype may use deterministic surface samples with an error bound; do not derive collected solar power from a decorative bloom.

[ASSUMED] The game layer renders this optical product from truth and delivers only view-dependent light to the window. Belief-side rendering cannot receive hidden body IDs, far geometry/depth or pairing transforms masquerading as measured tracks (P11). Camera observations carry bearings and feature correspondences with acquisition conditions; far-side range, velocity, GM and topology remain hypotheses. Accelerometers cannot measure far gravity through a ray. Existing radio can use the declared electromagnetic route only with actual pointing, power and link acquisition, not a new free sensor. The optical-only rule and the local-force rule need separately reported evidence.

## 6. Model transport and measured motion

[ASSUMED] For a fixed epoch with known mouths, state covariance transport is `P_B=J P_A J^T` for `J=[[R,0],[Rdot,R]]`. Joint mouth/ship parameter uncertainty adds the corresponding Jacobian terms, including cross-covariances. The actual first intersection is an event, not a fixed clock time: differentiate its root. With `g(x,t)=n_A(t)·(x-c_A(t))`, non-tangent crossing sensitivity has `delta_t=-delta_g/(dg/dt)`. Small `dg/dt` means large timing uncertainty; stop or branch rather than divide by nearly zero and draw certainty.

[ASSUMED] Propagate each deterministic uncertainty branch through partial occupancy, forces, clearance, full exit and rebasing. Mixed crossed/not-crossed outcomes are distinct domain-tagged branches, never one Gaussian line spanning the physical distance between mouths. At a boundary whose pairing, motion or material law is unsupported, end the main forecast and preserve conditional candidates separately. The reference's uniform-bar forecast includes first/last material times, split samples and parameter sensitivity through the whole integration. It intentionally does not implement the production feature estimator, moving-event covariance or a planner.

[ASSUMED] For measured metric rim points `p_j=c+Q s_j`, fit pose jointly from non-collinear correspondences, then fit `p_dot_j=u+w×(p_j-c)`. A least-squares design block is `[I, -[p_j-c]x]`. Three or more non-collinear **identified metric points**, plus adequate temporal sampling, can recover all six twist components; an unmarked circular silhouette cannot measure its spin about the normal. A single monocular image generally lacks metric scale and may have pose ambiguities. Source rim points alone do not measure the remote mouth's inertial velocity. The reference's noiseless four-feature fit only checks the algebra after metric reconstruction.

[ASSUMED] The player adopts connection topology, material transfer and a periodic motion family as rules; automatic fitting supplies pose, phase, period, motion amplitudes, feature associations and local environmental parameters with support. Distinct held-out attempts earn validation (A4); a fresh viewpoint in the same attempt is useful diagnostic evidence but not a substitute. See [play-and-build.md](play-and-build.md) for nonlethal material witnesses, unresolved associations and immutable forecast requirements.

## Source notes

[ASSUMED] X01–X03 are local study source labels, not additions to the shared bibliography. No source asserts real paired-opening physics.

| Label | Primary source and limited use |
| --- | --- |
| X01 | [NASA/JPL NAIF `sxform_c`](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/cspice/sxform_c.html): position/velocity state transformations |
| X02 | [NASA/JPL NAIF Rotation Required Reading](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/rotation.html): rotation derivatives, handedness and representation |
| X03 | [NASA/JPL NAIF Aberration Corrections](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/abcorr.html): limits of geometric observations |
| S14 | [NASA Glenn Torque](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/torque-moment/): force moments; no damage threshold |
| Project | [1B derivation](../../physics/derivation.md), [ship baseline](../../engineering/ship-baseline.md), [3D contracts](../../../src/contracts/README.md), [DECISIONS](../../DECISIONS.md): adopted game law, assumed hardware and interface direction |
