# 1B — Proposed physics and numerical reference

[ASSUMED] This is the bounded Phase 1 mathematics package for [1B](../build-plan/phase-1/1B-physics-derivation.md), dated 2026-11-14. It recommends retaining P1 and P4 with the clarifications below. It does **not** establish that a route is playable or that the future browser implementation is correct. The reference generator and numerical probe are research checks; Phase 2A must independently implement and test the equations.

[ASSUMED] Labels apply to the paragraph and the equation, table or list it introduces. **[FICTIONAL]** identifies an invented law and its conditional mathematical consequences, not an observed property of real gravity. **[ASSUMED]** identifies a modeling choice, numerical proposal or illustrative operating point. **[ESTABLISHED: ID]** refers to the existing [bibliography](../../References/BIBLIOGRAPHY.md). Numerical checks are identified explicitly as research-tool demonstrations, never as game demonstrations.

## 1. Implementation contract, units and normalization

[ASSUMED] Work in an inertial, right-handed plane, with counterclockwise positive angles. Positions and collision radii are in metres, time in seconds, inertial mass in kilograms, velocity in m/s, acceleration in m/s², force in N, energy in J, and specific energy in J/kg = m²/s². Angles are radians unless marked degrees. Use double precision. The out-of-plane initial state and all forces are zero under P1; there is no artificial projection of a spatial trajectory each frame.

[ASSUMED] Symbols used below:

| Symbol | Meaning | SI unit |
|---|---|---|
| p | Positive exponent of acceleration **magnitude**; 2 or 2.5 here | 1 |
| G | Ordinary Newtonian constant, used to name source masses | m³ kg⁻¹ s⁻² |
| M, m | Source and test/ship inertial masses | kg |
| μ = GM | Source parameter stored as `GM` | m³ s⁻² |
| r₀ | One constant, shared reference length for the environment | m |
| Gₚ = G r₀^(p−2) | Universal coupling for exponent p | m^(p+1) kg⁻¹ s⁻² |
| K = μ r₀^(p−2) | Source acceleration coefficient | m^(p+1) s⁻² |
| r, **r**, r̂ | Source-to-test distance, displacement, unit direction | m, m, 1 |
| Φ, ε | Potential per unit mass, specific mechanical energy | m² s⁻² |
| h = (**r** × **v**)z | Signed specific angular momentum | m² s⁻¹ |
| Ω, κ, n | Circular angular, radial epicyclic, binary angular frequency | s⁻¹ |

[ESTABLISHED: S23] Use the NIST value $G=6.67430\times10^{-11}\ \mathrm{m^3\,kg^{-1}\,s^{-2}}$ to translate the illustrative μ values into masses. Its experimental uncertainty is irrelevant to this authored scale; the stored μ values define the simulation. [NIST CODATA](https://physics.nist.gov/cuu/pdf/wallet_2022.pdf).

### Recommended P4

[FICTIONAL] Apply this force to every gravitational pair. For a fixed source at **b**, set **r** = **x** − **b**, r = |**r**|, and use:

$$
\mathbf a_p(\mathbf r)=-\frac{K\mathbf r}{r^{p+1}}
=-\frac{\mu}{r_0^2}\left(\frac{r_0}{r}\right)^p\hat{\mathbf r}
\quad[\mathrm{m\,s^{-2}}].
$$

[FICTIONAL] In particular, p = 2.5 gives $K=\mu\sqrt{r_0}\ [\mathrm{m^{3.5}\,s^{-2}}]$, and the vector denominator is **r^3.5**, not r^2.5. At p = 2 the same definition reduces to Newtonian gravity and r₀ drops out. Multiply acceleration by the test mass for force; never put test mass into the acceleration routine. Sum contributions from all included sources.

[ASSUMED] Retain P4 because it defines a meaningful calibration: at distance r₀ a single source with parameter μ gives the same instantaneous acceleration as a Newtonian model with that μ. Physically r₀ is a fixed crossover scale of the proposed law. In play it can coincide with the initial primary-body calibration range, but it is not the current ship range, a per-observer setting, or a value to update after a fit. A binary's **total** acceleration is not automatically Newtonian merely because the ship is r₀ from one body. An observer measures K; separating μ and r₀ requires fixing the convention or obtaining independent mass information.

[ASSUMED] **Use one shared r₀ for ship, primary, secondary and asteroids.** Assigning each source its own r₀ while retaining ordinary inertial masses generally makes the two mutual forces unequal, destroying momentum conservation. Changing the displayed reference radius without changing the force requires $\mu' = \mu(r_0/r'_0)^{p-2}\ [\mathrm{m^3\,s^{-2}}]$. Changing r₀ alone changes the physical model.

### Alternatives evaluated

[ASSUMED] Alternative A is to store a fundamental $G_{2.5}\ [\mathrm{m^{3.5}\,kg^{-1}\,s^{-2}}]$ and compute $K=G_{2.5}M\ [\mathrm{m^{3.5}\,s^{-2}}]$, without naming a crossover radius. This is equally consistent and reciprocal, but its magnitude still needs choosing; $G_{2.5}=G\sqrt{r_0}$ makes it exactly P4. It is less convenient for a Newtonian starting model and an arrival calibration.

[ASSUMED] Alternative B is to store a measured acceleration $a_*\ [\mathrm{m\,s^{-2}}]$ at a declared range $r_*\ [\mathrm m]$, giving $K=a_*r_*^p\ [\mathrm{m^{p+1}\,s^{-2}}]$. This is useful for inference without pretending that a fitted strength is a measured mass. For a mutual binary, however, enforce $K_1/M_1=K_2/M_2=G_p\ [\mathrm{m^{p+1}\,kg^{-1}\,s^{-2}}]$. Independently matching Newtonian surface gravity at each differently sized body's own radius would violate that condition. Recommendation: P4 in truth data, K or μ with fixed r₀ in fitted models.

[ASSUMED] Bodies are gravitational **point centers with finite collision envelopes**. For p ≠ 2 the Newtonian shell theorem does not justify replacing an extended spherical density distribution by a point exactly. Therefore the collision radii below do not define an exact extended-matter gravity model. Stop or resolve contact at the envelope; do not evaluate the singular center or silently add softening. If softening or distributed bodies are later required, rederive potential and regenerate vectors. No atmosphere, drag, relativity, tides in the material, or asteroid self-gravity is included here.

## 2. Isolated source: integrals, orbits and escape

### Potential and conserved quantities

[FICTIONAL] For p > 1 choose zero potential at infinity. Integrating $d\Phi/dr=K/r^p\ [\mathrm{m\,s^{-2}}]$ gives:

$$
\Phi(r)=-\frac{K}{(p-1)r^{p-1}}\quad[\mathrm{m^2\,s^{-2}}],\qquad
U=m\Phi\quad[\mathrm J].
$$

[FICTIONAL] For an isolated fixed source and an unpowered test mass, central force implies zero torque and time independence implies conserved energy:

$$
h=r^2\dot\theta\quad[\mathrm{m^2\,s^{-1}}],\qquad
\epsilon=\tfrac12|\mathbf v|^2+\Phi
=\tfrac12\dot r^2+V_{\rm eff}(r)\quad[\mathrm{m^2\,s^{-2}}],
$$
$$
V_{\rm eff}(r)=\frac{h^2}{2r^2}-\frac{K}{(p-1)r^{p-1}}
\quad[\mathrm{m^2\,s^{-2}}].
$$

[FICTIONAL] The swept area rate remains $dA/dt=h/2\ [\mathrm{m^2\,s^{-1}}]$. Kepler's equal-area statement survives for a central force; conic shapes and the ordinary period–semimajor-axis law do not. In a moving binary, the ship generally conserves neither its inertial energy nor its angular momentum about one body.

### Circular solution and its stability

[FICTIONAL] Set $dV_{\rm eff}/dr=0\ [\mathrm{m\,s^{-2}}]$. At radius r꜀:

$$
h_c^2=K r_c^{3-p}\quad[\mathrm{m^4\,s^{-2}}],\qquad
v_c=\sqrt{K r_c^{1-p}}\quad[\mathrm{m\,s^{-1}}],
$$
$$
\Omega=\sqrt{K/r_c^{p+1}}\quad[\mathrm{s^{-1}}],\qquad
T_c=2\pi\sqrt{r_c^{p+1}/K}\quad[\mathrm s],
$$
$$
\epsilon_c=\frac{p-3}{2(p-1)}\frac{K}{r_c^{p-1}}
\quad[\mathrm{m^2\,s^{-2}}].
$$

[FICTIONAL] The second derivative at the stationary point is $V''_{\rm eff}(r_c)=(3-p)K/r_c^{p+1}\ [\mathrm{s^{-2}}]$. Hence small radial perturbations are stable for p < 3, with $\kappa=\sqrt{3-p}\,\Omega\ [\mathrm{s^{-1}}]$. At p = 3 the minimum disappears (degenerate, not a robust stable orbit); p > 3 is unstable. For p = 2.5, $v_c\propto r^{-3/4}$ and $T_c\propto r^{7/4}$; doubling radius multiplies period by $2^{7/4}=3.363585661\ [1]$, versus $2^{3/2}=2.828427125\ [1]$ for p = 2.

### Apsides and precession: distinguish three angles

[ESTABLISHED: R03] Small oscillations about a circular orbit in an attractive central power law have consecutive-apsis angle $\psi=\pi/\sqrt{3-p}\ [\mathrm{rad}]$. R03 uses a signed force exponent n = −p and defines consecutive apsides as a radial maximum followed by a minimum. [University of Texas derivation](https://farside.ph.utexas.edu/teaching/336k/lectures/node45.html).

[FICTIONAL] Applying that result to the invented law, the near-circular radial period and periapse-to-periapse angle are:

$$
T_r=\frac{2\pi}{\kappa}=\frac{T_c}{\sqrt{3-p}}\quad[\mathrm s],\qquad
\Delta\theta_r=\frac{2\pi}{\sqrt{3-p}}\quad[\mathrm{rad}],\qquad
\Delta\varpi=\Delta\theta_r-2\pi\quad[\mathrm{rad}].
$$

[FICTIONAL] The p = 2.5 near-circular limit gives the following; p = 2 gives 180°, 360°, 0° respectively.

| Quantity | p = 2.5 value |
|---|---:|
| Periapse to next apoapse, ψ | 254.558441227° |
| Periapse to next periapse, unwrapped Δθᵣ | 509.116882454° |
| Prograde periapse advance Δϖ per radial cycle | **149.116882454°** |

[ASSUMED] P4's “about 149°” is correct **per radial cycle**, in the small-eccentricity limit. Do not apply it per 360° revolution or assign periapse to an exactly circular orbit. Larger radial excursions need integration of the actual orbit, not a fixed precession correction.

### Escape and noncircular shapes

[FICTIONAL] Setting zero total specific energy gives the isolated-source escape threshold:

$$
v_{\rm esc}(r)=\sqrt{\frac{2K}{(p-1)r^{p-1}}}
=\sqrt{\frac{2}{p-1}}\,v_c(r)\quad[\mathrm{m\,s^{-1}}].
$$

[FICTIONAL] Thus $v_{\rm esc}/v_c=\sqrt{4/3}=1.154700538\ [1]$ at p = 2.5, validating P4; it is √2 at p = 2. This is a speed/energy threshold with an accessible outward path, not immunity to striking a finite body on an inward trajectory. It is not a general binary-escape formula.

[FICTIONAL] For 1 < p < 3 and h ≠ 0 the centrifugal term grows faster than the attractive potential as r → 0, producing an inner barrier. Negative energy above the effective-potential minimum produces two turning radii rₚ and rₐ and a bounded rosette unless a collision envelope intervenes. Radial h = 0 trajectories have no such barrier. Positive energy can produce an unbound scattering path; the p = 2.5 zero-energy path is not a Newtonian parabola.

[FICTIONAL] Given turning radii, the orbit can be specified without Newtonian orbital elements:

$$
h^2=\frac{2[\Phi(r_a)-\Phi(r_p)]}{r_p^{-2}-r_a^{-2}}
\quad[\mathrm{m^4\,s^{-2}}],\qquad
\epsilon=\Phi(r_p)+\frac{h^2}{2r_p^2}\quad[\mathrm{m^2\,s^{-2}}].
$$

[FICTIONAL] The time and angle from periapse to apoapse are the quadratures below. The endpoint square-root singularities are integrable; use a change of variable or trajectory/event integration, not a naive endpoint evaluation.

$$
\tfrac12 T_r=\int_{r_p}^{r_a}\frac{dr}{\sqrt{2[\epsilon-V_{\rm eff}(r)]}}
\quad[\mathrm s],\qquad
\tfrac12\Delta\theta_r=\int_{r_p}^{r_a}\frac{h\,dr}{r^2\sqrt{2[\epsilon-V_{\rm eff}(r)]}}
\quad[\mathrm{rad}].
$$

[FICTIONAL] Equivalently Binet's equation, with $u=1/r\ [\mathrm{m^{-1}}]$, is $u''(\theta)+u=(K/h^2)u^{p-2}\ [\mathrm{m^{-1}}]$. It is linear for p = 2, but nonlinear for p = 2.5. Orbits are generally precessing, nonclosing rosettes; do not claim every eccentric orbit is an ellipse or that no special resonant orbit could close. If an “eccentricity” is displayed, explicitly define a geometric excursion measure $e_r=(r_a-r_p)/(r_a+r_p)\ [1]$, not a Keplerian element with implied conic formulas.

## 3. Two massive bodies and test particles

### Mutual binary, rather than two fixed wells

[FICTIONAL] With a common Gₚ, the pair force is reciprocal and central:

$$
\mathbf F_{12}=G_pM_1M_2\frac{\mathbf x_2-\mathbf x_1}{d^{p+1}}
=-\mathbf F_{21}\quad[\mathrm N],\qquad d=|\mathbf x_2-\mathbf x_1|\quad[\mathrm m].
$$

[FICTIONAL] Let **R** = **x₂** − **x₁**, $M_T=M_1+M_2\ [\mathrm{kg}]$, reduced mass $m_{\rm red}=M_1M_2/M_T\ [\mathrm{kg}]$, and $K_T=K_1+K_2\ [\mathrm{m^{p+1}\,s^{-2}}]$. The center of mass moves uniformly and the relative orbit obeys:

$$
\ddot{\mathbf R}=-K_T\frac{\mathbf R}{R^{p+1}}\quad[\mathrm{m\,s^{-2}}],\qquad
E_{\rm rel}=m_{\rm red}\left(\tfrac12|\dot{\mathbf R}|^2-\frac{K_T}{(p-1)R^{p-1}}\right)\quad[\mathrm J].
$$

[FICTIONAL] The isolated binary conserves total energy, linear momentum and angular momentum. Its noncircular relative orbit follows the same rosette equations as §2. For a circular binary with separation d, its angular rate is $n=\sqrt{K_T/d^{p+1}}\ [\mathrm{s^{-1}}]$. With $q=M_2/M_T=K_2/K_T\ [1]$, initial barycentric positions are $\mathbf x_1=(-qd,0),\mathbf x_2=((1-q)d,0)\ [\mathrm m]$, and velocities are $\mathbf v_i=n\hat{\mathbf z}\times\mathbf x_i\ [\mathrm{m\,s^{-1}}]$. Move the bodies during every forecast; a frozen binary is a different, externally constrained model.

[ASSUMED] Treat the ship and ordinary asteroids as massless test particles for gravity backreaction, while retaining each ship/component's actual mass for propulsion and damage. Each feels **both moving sources** under the same law. Source–source motion is mutual. If massive asteroids are later included, extend the reciprocal pair calculation to them and recheck cost. Prescribed asteroid “Newtonian ellipses” are inconsistent with this environment.

### Circular restricted problem and its equilibria

[FICTIONAL] Only a circular binary admits the following time-independent rotating frame. Let (x,y) be rotating, barycentric coordinates, $r_i=|\mathbf x-\mathbf x_i|\ [\mathrm m]$, and define positive rotating pseudo-potential W:

$$
W(x,y)=\tfrac12 n^2(x^2+y^2)+\sum_i\frac{K_i}{(p-1)r_i^{p-1}}
\quad[\mathrm{m^2\,s^{-2}}].
$$
$$
\ddot x-2n\dot y=W_x,\qquad \ddot y+2n\dot x=W_y
\quad[\mathrm{m\,s^{-2}}],\qquad
C=2W-(\dot x^2+\dot y^2)\quad[\mathrm{m^2\,s^{-2}}].
$$

[FICTIONAL] C is the Jacobi constant for a coasting test particle and an exactly circular binary. Convert inertial velocity using $\mathbf v_{\rm rot}=Q(-nt)[\mathbf v_{\rm inertial}-n\hat{\mathbf z}\times\mathbf x_{\rm inertial}]\ [\mathrm{m\,s^{-1}}]$, with Q a planar rotation. Allowed positions satisfy $2W\ge C\ [\mathrm{m^2\,s^{-2}}]$. The open/closed passages through this zero-velocity geometry matter more than a single-body escape-speed label. A noncircular binary has no constant n and no such conserved C.

[FICTIONAL] Solve ∇W = 0 for equilibria. In dimensionless coordinates $X=x/d,\ Y=y/d\ [1]$, put $X_1=-q, X_2=1-q\ [1]$. The three collinear roots lie one per interval separated by the sources and solve:

$$
f(X)=X-(1-q)\frac{X+q}{|X+q|^{p+1}}-q\frac{X-1+q}{|X-1+q|^{p+1}}=0\quad[1].
$$

[FICTIONAL] On each interval $f'(X)=1+p[(1-q)/|X+q|^{p+1}+q/|X-1+q|^{p+1}]>0\ [1]$; the boundary limits give one root. Use bracketed bisection and never bracket across a source. The two noncollinear roots remain equilateral:

$$
(X,Y)=\left(\tfrac12-q,\ \pm\tfrac{\sqrt3}{2}\right)\quad[1].
$$

[FICTIONAL] Linear stability is a separate calculation. With $H=\nabla\nabla W\ [\mathrm{s^{-2}}]$, perturbations proportional to exp(λt) obey:

$$
\lambda^4+(4n^2-H_{xx}-H_{yy})\lambda^2+
H_{xx}H_{yy}-H_{xy}^2=0\quad[\mathrm{s^{-4}}].
$$

[FICTIONAL] At a collinear root let $A=\sum_i K_i/r_i^{p+1}\ [\mathrm{s^{-2}}]$. Then $H_{xx}=n^2+pA,\ H_{yy}=n^2-A,\ H_{xy}=0\ [\mathrm{s^{-2}}]$. Here A > n², so the constant term is negative and a real growing eigenmode exists. Thus **all three collinear points are unstable** for the present p and positive masses. In the inner interval both distances are below d. Outside the binary, define $S=A/n^2,\ a=|X+q|,\ b=|X-1+q|\ [1]$. The equilibrium equation rearranges to $X(1-S)=q(1-q)[a^{-p-1}-b^{-p-1}]\ [1]$. To the right X > 0 and a > b; to the left X < 0 and a < b. In both cases S > 1 follows from the signs. A zero net rotating force does not imply a stable resting point.

[FICTIONAL] At either triangular root, in units of n², the Hessian is:

$$
\frac{H}{n^2}=(p+1)
\begin{pmatrix}
1/4 & \pm\sqrt3(1-2q)/4\\
\pm\sqrt3(1-2q)/4 & 3/4
\end{pmatrix}\quad[1].
$$

[FICTIONAL] Writing $z=\lambda/n\ [1]$ yields $z^4+(3-p)z^2+\tfrac34(p+1)^2q(1-q)=0\ [1]$. For 1 < p < 3, purely imaginary, distinct planar eigenvalues require:

$$
q(1-q)<\frac{(3-p)^2}{3(p+1)^2}\quad[1].
$$

[FICTIONAL] At p = 2 this recovers $q_{\rm crit}\simeq0.0385208965\ [1]$. At p = 2.5, $q_{\rm crit}=0.00684963864\ [1]$, taking q ≤ 1/2. Equality is degenerate; the linear test alone establishes neither nonlinear stability nor long-term asteroid survival. The proposed q = 0.2 binary is far above the threshold: **all five points are unstable**. If P1 is later relaxed, the infinitesimal vertical mode at an equilibrium obeys $\ddot z=-Az\ [\mathrm{m\,s^{-2}}]$; that oscillatory vertical mode does not cure planar instability.

[ASSUMED] For the §6 scale, proposed p = 2.5 equilibrium coordinates are as follows. These are rotating-frame mathematics, not safe parking destinations; collision envelopes and finite disturbances still apply.

| Point | x (m), barycentric | y (m) | Planar result |
|---|---:|---:|---|
| L1, between bodies | 1,676,402.064 | 0 | Unstable |
| L2, beyond secondary | 5,271,636.489 | 0 | Unstable |
| L3, beyond primary | −4,381,138.336 | 0 | Unstable |
| L4 | 1,200,000 | 3,464,101.615 | Unstable |
| L5 | 1,200,000 | −3,464,101.615 | Unstable |

### Asteroids and local motion

[FICTIONAL] Asteroids may follow local rosettes near a source, circumbinary paths far away, or sensitive scattering paths near the bodies and rotating-frame passages. Their specific energy can change through encounters with a moving source; this is ordinary gravitational exchange under the assumed conservative pair law, not numerical energy creation. Do not certify a permanent “stable belt” from a snapshot. Test every authored population over the relevant encounter duration and check clearance.

[FICTIONAL] The distant source's leading tidal acceleration across a displacement **ρ** is $\delta\mathbf a_2\simeq [K_2/R^{p+1}][(p+1)\hat{\mathbf R}\hat{\mathbf R}^{T}-I]\boldsymbol\rho\ [\mathrm{m\,s^{-2}}]$. Radial stretch is p times that coefficient and transverse compression is minus one times it. For q ≪ 1 a Hill-like length around the secondary is $\rho_H\simeq d[q/(p+1)]^{1/(p+1)}\ [\mathrm m]$, from balancing secondary attraction against the rotating primary tide. The usual Newtonian cube-root rule becomes a 1/3.5 power here. q = 0.2 is not a small mass ratio: use actual equilibria and trajectories, not this asymptotic radius, to establish a passage.

## 4. What a Newtonian forecast gets wrong

### Distance law versus fitted mass

[FICTIONAL] For an isolated contribution, a Newtonian estimator matching the local acceleration infers:

$$
\widehat\mu_N(r)=|\mathbf a_p|r^2=\mu(r_0/r)^{p-2}
\quad[\mathrm{m^3\,s^{-2}}].
$$

[FICTIONAL] For p = 2.5 the apparent μ falls as r⁻¹ᐟ². A mass-only refit at one radius cannot establish the force law. At any single radius a circular orbit can be matched forever by choosing the corresponding Newtonian μ; in particular a circle at r₀ is identical in both models. Seek radial variation, several ranges, or different coasting arcs.

[ASSUMED] The table gives isolated-primary predictions with μ = 10¹⁰ m³/s² and r₀ = 10⁶ m. The position column is the **frozen-geometry, short-time** estimate $|\delta\mathbf x|\simeq\tfrac12|\delta\mathbf a|t^2\ [\mathrm m]$, not an integrated checkpoint.

| r/r₀ | μ̂N/μ (= a₂.₅/a₂) | a₂.₅ (m/s²) | a₂ (m/s²) | Estimated miss after 600 s (m) |
|---:|---:|---:|---:|---:|
| 0.5 | 1.414214 | 0.05656854 | 0.04000000 | 2,982.34 |
| 1 | 1 | 0.01000000 | 0.01000000 | 0 at this order |
| 2 | 0.707107 | 0.00176777 | 0.00250000 | 131.80 |
| 4 | 0.5 | 0.00031250 | 0.00062500 | 56.25 |

[FICTIONAL] For truth-minus-forecast error with the same initial state, $\delta\mathbf v\simeq\delta\mathbf a\,t\ [\mathrm{m\,s^{-1}}]$ and $\delta\mathbf x\simeq\delta\mathbf a\,t^2/2\ [\mathrm m]$. Require t small compared with both the field's dynamical time and the time for appreciable range/direction change. Near unstable binary paths an initially small error can subsequently grow exponentially; no universal t² accuracy guarantee exists.

[DEMONSTRATED: python tools/physics/generate_vectors.py --report] A separate integrated example starts both models at **r** = (2,000,000,0) m, **v** = (0,59.4603557501) m/s, with the same fixed primary and no thrust. Truth is circular under p = 2.5; the Newtonian forecast retains the μ calibrated at r₀. The refined reference integration gives these Euclidean state-error norms:

| Elapsed physical time (s) | Position error (m) | Velocity error (m/s) |
|---:|---:|---:|
| 100 | 3.661172 | 0.073224 |
| 1,000 | 366.183809 | 0.732511 |
| 10,000 | 37,284.365062 | 7.601991 |

[ASSUMED] This example holds the forecast's calibrated mass fixed. Allowing a fresh Newtonian mass fit at 2r₀ would reproduce that single circular orbit; a held-out arc with different range is needed to reject that fit. The table demonstrates model mismatch under stated inputs, not a guaranteed discrepancy for every observation.

[FICTIONAL] At r₀ the initial acceleration mismatch vanishes. For initial radial speed vᵣ, the leading mismatch in jerk is $\delta\mathbf j=(p-2)(a_0v_r/r_0)\hat{\mathbf r}\ [\mathrm{m\,s^{-3}}]$, where $a_0=\mu/r_0^2\ [\mathrm{m\,s^{-2}}]$. Then $\delta\mathbf x\simeq\delta\mathbf j\,t^3/6\ [\mathrm m]$. If vᵣ is zero this cubic term also vanishes; the exact calibrated circle has zero mismatch at all times. A forecast discrepancy is conditional on the experiment, not a timed reveal.

[ASSUMED] Quantitative discriminants below require tracking uncertainty estimates and varied geometry. They are hypothesis tests, not unique proofs from one short arc.

| Hypothesis | Signature to test | What would undermine it |
|---|---|---|
| Wrong constant mass, correct exponent | Constant multiplicative radial error; μ̂ = a rᵖ / r₀^(p−2) stays fixed across ranges | Range-dependent inferred μ after controlling biases |
| Wrong exponent | $p_{\rm fit}=-\ln(a_2/a_1)/\ln(r_2/r_1)\ [1]$; Newtonian μ̂ slope $d\ln\widehat\mu_N/d\ln r=-0.5\ [1]$ here | A held-out radial arc does not follow the fitted slope |
| Missing second source | Residual points toward its changing location in an inertial frame; transverse component and tide correlate with geometry | A constant radial correction explains all observed geometries |
| Wrong propulsion calibration | Residual correlates with throttle, body attitude or valve timing, and disappears in matched coasts | Persistent unpowered curvature mismatch |

[ASSUMED] A factor-four range span gives a factor-two apparent-mass drift for p = 2.5. A factor-two range span gives an acceleration ratio 2⁻²⋅⁵ = 0.1767767 [1], versus 0.25 [1] Newtonian. If independent acceleration estimates each have 1% fractional uncertainty and range is accurately known, then $\sigma_p\simeq\sqrt{\sigma_{a1}^2/a_1^2+\sigma_{a2}^2/a_2^2}/|\ln(r_2/r_1)|=0.0204\ [1]$ for a factor-two range span. This is a conditional sensitivity calculation, not a promise of actual sensor performance; range uncertainty, correlated tracking bias and the binary can dominate.

### Tracking frame and coast–burn comparisons

[ASSUMED] P7 requires gravity to be inferred from tracked motion. Ideal accelerometers measure specific non-gravitational force; a coasting accelerometer reads approximately zero even in a strong gravity field. Estimate curvature using a fitted observation arc with measurement covariance, rather than directly second-differencing noisy individual fixes. Optical navigation is an established measurement method; actual sensor accuracy/power comes from 1C/1G. [ESTABLISHED: DD03] [NASA navigation](https://science.nasa.gov/learn/basics-of-space-flight/chapter13-1/) describes deriving trajectories from tracking and optical observations.

[FICTIONAL] Be explicit about frames. Tracking relative to primary 1 gives:

$$
\ddot{\boldsymbol\rho}=-K_1\frac{\boldsymbol\rho}{\rho^{p+1}}
 +\mathbf a_2(\mathbf x_1+\boldsymbol\rho)-\mathbf a_2(\mathbf x_1)
 +\mathbf a_{\rm thrust}\quad[\mathrm{m\,s^{-2}}].
$$

[ASSUMED] For primary at (0,0) m, secondary at (4×10⁶,0) m and ship at (0,10⁶) m with §6 strengths, the secondary's inertial ship acceleration is (7.02610×10⁻⁵, −1.75653×10⁻⁵) m/s². Its acceleration of the primary is (7.8125×10⁻⁵,0) m/s². The **relative** missing-source residual is therefore (−7.86399×10⁻⁶, −1.75653×10⁻⁵) m/s², about (−1.416, −3.162) m of frozen-field tracking error after 600 s. Fitting relative curvature as if the primary were inertial would confuse this tide with a mass or exponent error.

[ASSUMED] Compare a coast arc with powered arcs at nearby ranges and known attitude, recording commanded thrust, mass flow, specific-force measurements and tracking. Subtract the measured/estimated thrust contribution from powered curvature, and test whether the same gravitational model explains the coasts. Interleave multiple orientations or opposite burns to expose alignment errors; repropagate to account for the differing paths instead of subtracting trajectories at unequal locations. Inverse Wells need a separate thrust-response hypothesis (§8); an engine calibration cannot safely absorb that position-dependent direction reversal. Preserve the originally issued forecast and test a revised rule on held-out data under P5/P11.

## 5. Maneuvers: what remains valid

[ESTABLISHED: S12, S13] Ordinary chemical exhaust retains its mass-flow and ideal impulse relation. With specific impulse $I_{sp}\ [\mathrm s]$, thrust F [N], and conventional standard gravity $g_0=9.80665\ \mathrm{m\,s^{-2}}$, define $v_e=I_{sp}g_0\ [\mathrm{m\,s^{-1}}]$. Then $\dot m=-F/v_e\ [\mathrm{kg\,s^{-1}}]$ and $\Delta v_{\rm ideal}=v_e\ln(m_i/m_f)\ [\mathrm{m\,s^{-1}}]$. g₀ is the conventional unit conversion for Isp, not the local gravity. [NASA rocket equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ideal-rocket-equation/).

[FICTIONAL] Changing the gravity exponent does not change that exhaust relation outside the explicit well fiction. It changes the **trajectory** during a burn. Ideal scalar Δv is the integral of thrust acceleration magnitude; vector velocity change also includes gravity and changing thrust direction. A generic “g × burn duration” penalty is not valid for every in-space maneuver.

[FICTIONAL] An instantaneous velocity change at a fixed position changes specific orbital energy by $\Delta\epsilon=\mathbf v\cdot\Delta\mathbf v+\tfrac12|\Delta\mathbf v|^2\ [\mathrm{m^2\,s^{-2}}]$, independent of the potential exponent. The Oberth benefit of a prograde impulse at high speed therefore persists. A finite burn must integrate $\dot\epsilon=\mathbf v\cdot\mathbf a_{\rm thrust}\ [\mathrm{m^2\,s^{-3}}]$ for a static source, plus explicit potential time dependence for a moving binary. Avoid applying the impulse formula to a long burn as if it all occurred at periapse.

[FICTIONAL] A two-impulse, two-turning-radius transfer can still be computed in an isolated source using §2's h and ε: transfer endpoint speeds are $v_p=h/r_p,\ v_a=h/r_a\ [\mathrm{m\,s^{-1}}]$; subtract local circular speeds for tangential impulses. Its angular span is generally not 180°, and flight time is the radial quadrature. Newtonian Hohmann closed forms, the conic vis-viva relation and Keplerian anomaly clocks cannot be reused. There is no claim that this family is optimal for the binary, a moving target or a constrained finite-thrust ship.

[ASSUMED] Schedule burn start, duration, pointing, expected end mass, observation windows and clearance as one propagated plan. Begin a near-periapse burn early enough to straddle the intended high-speed region, but solve the timing with the finite-thrust forecast. Preserve a reserve for braking and attitude; the low isolated escape-to-circle ratio also means small extra burns can change a bounded arc into an unbound one. Confirm target arrival phase after each substantial correction.

## 6. A candidate encounter scale and ship demands

[ASSUMED] These values are a self-consistent candidate for an encounter, not a change to 1C's ship ownership or a proved route. They describe small worlds, not Earth/Mars-size planets. There is no automatic resupply implied.

| Parameter | Proposed SI value | Purpose |
|---|---:|---|
| Shared r₀ | 1,000,000 m | Initial single-primary calibration scale |
| Primary μ₁ | 10,000,000,000 m³/s² | 100 m/s circular speed at r₀ |
| Secondary μ₂ | 2,500,000,000 m³/s² | q = 0.2, visibly nonnegligible second source |
| Primary mass from S23 G | 1.49828446×10²⁰ kg | Mass interpretation of μ₁ |
| Secondary mass from S23 G | 3.74571116×10¹⁹ kg | Mass interpretation of μ₂ |
| Primary / secondary collision radius | 250,000 / 160,000 m | Keep singular centers outside play |
| Binary separation | 4,000,000 m | Circular baseline; both bodies move |
| Typical primary range | 400,000–2,000,000 m | Radial leverage for discovery |
| Typical flight speed | 40–200 m/s | Chemical propulsion can reshape an arc |

[ASSUMED] These masses/radii correspond to mean density bookkeeping of about 2,289 and 2,183 kg/m³. That is only a size plausibility check, not an extended-body field calculation. The point-center approximation remains explicit. The binary relative circular speed is 39.52847 m/s, its period is 635,813.649 s (176.615 h), and the barycentric speeds are 7.90569 and 31.62278 m/s. Over a 10,000 s flight it rotates about 5.662°, enough to matter for forecasts.

[ASSUMED] Isolated-primary values at the proposed scale follow below. The second source perturbs these values; they are not exact binary orbits.

| Primary range (m) | Gravity (m/s²) | Circular speed (m/s) | Circular period (s) | Escape speed (m/s) |
|---:|---:|---:|---:|---:|
| 400,000 | 0.09882118 | 198.81768 | 12,641.100 | 229.57488 |
| 500,000 | 0.05656854 | 168.17928 | 18,680.022 | 194.19671 |
| 1,000,000 | 0.01000000 | 100.00000 | 62,831.853 | 115.47005 |
| 2,000,000 | 0.00176777 | 59.46036 | 211,340.320 | 68.65890 |

[ASSUMED] A 1–2×10⁶ m passage at roughly 100 m/s has a characteristic duration 10,000–20,000 s, or 2.8–5.6 minutes at 60× warp. A full r₀ orbit is unnecessary for discovery. Reduce warp around burns, uncertain clearance and observation windows; do not increase physical time step with warp. At 60× and 60 displayed frames/s, a 1 s physical step averages one tick/frame. Larger warp requires more ticks, not skipped dynamics. These are timing estimates; 2F must prove the chosen passage is understandable and survivable.

[ASSUMED] To bound maneuver cost pending 1C, take initial ship mass 30,000 kg, usable chemical propellant 4,000 kg (final mass 26,000 kg), Isp = 320 s, and main thrust 20,000 N. These give $v_e=3138.128\ \mathrm{m/s}$, initial acceleration 0.6667 m/s², mass flow 6.37323 kg/s, and total ideal Δv ≈ 449.07 m/s. The figure is a budget illustration, not an expedition fuel allocation.

[ASSUMED] Independent burns starting at 30,000 kg have the following ideal costs. Real successive burns start at the mass actually remaining.

| Ideal Δv (m/s) | Propellant (kg) | Duration at 20 kN (s) |
|---:|---:|---:|
| 20 | 190.59 | 29.90 |
| 50 | 474.20 | 74.41 |
| 80 | 755.12 | 118.48 |
| 100 | 940.91 | 147.64 |

[ASSUMED] A 50 m/s burn lasts long enough to travel roughly 7.4 km at 100 m/s before accounting for changing speed. At primary range 400 km the local circular direction changes about 2.1° in 74 s, and gravity alone contributes an order-7 m/s velocity change over that time. Thus finite burns, pointing and start timing matter. Candidate local corrections of 20–80 m/s fit within the illustrative budget, but cumulative encounter and return reserves require 1C/1F reconciliation.

[ASSUMED] If total translational RCS thrust is 400 N, initial authority is only 0.0133 m/s² on this ship. It can trim a coasting path but cannot hover against 0.0988 m/s² at 400 km. “Cannot hover” does not mean “cannot orbit”: a free-fall orbit needs no continuous thrust. RCS thrust, Isp, torque arms, inertia, duty cycle and actual reserve remain 1C's decisions; do not scale attitude response directly from this translational example.

[ASSUMED] The chemical engine's propulsive energy does not come from the electrical bus. Electrical loads are valves, control, pumps if applicable, sensing, computation, attitude equipment and ordinary hotel loads; exhaust power is not radiator load. For example, an assumed 2 kW incremental control/pump load for a 74.41 s burn costs 148.8 kJ = 41.34 Wh, while an assumed 1 kW navigation allocation for a 10,000 s coast costs 10 MJ = 2.778 kWh. Long, high-warp coasts still consume physical energy and reject physical heat.

[ESTABLISHED: S02, S23] Radiation heat rejection depends strongly on temperature, emissivity and view to a cold sink. In the ideal unilluminated one-sided radiator approximation, $Q=\epsilon_{\rm rad}\sigma A(T^4-T_{\rm sink}^4)\ [\mathrm W]$, with σ = 5.670374419×10⁻⁸ W m⁻² K⁻⁴, area A [m²], temperature [K] and emissivity [1]. [NASA thermal control](https://www.nasa.gov/smallsat-institute/sst-soa/thermal-control/) and [NIST constants](https://physics.nist.gov/cuu/pdf/wallet_2022.pdf).

[ASSUMED] At 320 K, emissivity 0.85 and negligible sink temperature, ideal rejection is about 505 W/m²; 10 kW would need about 19.8 m² of effective radiating area before illumination, blockage or transport limits. An assumed 5 kW heat imbalance over 600 s stores 3 MJ; with effective heat capacity 1 MJ/K that raises temperature 3 K. These are sensitivity examples, not 1C hardware ratings. Schedule observations, burns and cooldown against actual bus margin, battery energy, radiator pointing and component temperatures; changing gravity creates no new thermal law.

## 7. Deterministic numerical method

[ASSUMED] Recommend **fixed-step kick–drift–kick velocity Verlet** for gravity-only truth propagation and compatible coasting forecasts. For all mutually interacting bodies, evaluate forces from the same positions, then update all bodies in each stage:

$$
\mathbf v_{k+1/2}=\mathbf v_k+\tfrac12\Delta t\,\mathbf a(\mathbf x_k)
\quad[\mathrm{m\,s^{-1}}],
$$
$$
\mathbf x_{k+1}=\mathbf x_k+\Delta t\,\mathbf v_{k+1/2}\quad[\mathrm m],\qquad
\mathbf v_{k+1}=\mathbf v_{k+1/2}+\tfrac12\Delta t\,\mathbf a(\mathbf x_{k+1})
\quad[\mathrm{m\,s^{-1}}].
$$

[ASSUMED] With cached endpoint accelerations this needs one new force evaluation per step. A fixed-step conservative Hamiltonian implementation is time reversible and symplectic; expect a bounded, oscillating energy error of order Δt² on well-resolved regular orbits, not exact physical-energy conservation. Phase error can continue accumulating while the energy plot looks excellent. RK4 has global error of order Δt⁴ on smooth finite intervals but uses four force stages and does not retain the same symplectic long-term property. It remains useful as a separate check or for smooth finite burns. Explicit Euler is unsuitable for orbital coasts.

[ASSUMED] Start with **Δt = 1 s** for the scale above, and make commands start/end on integer ticks unless a finer declared grid is required. Warp changes tick count only. Use a consistent ordering for forces, events, propellant, heat and observations; record the tick and command sequence. Avoid wall-clock-dependent stepping, random jitter, unsorted summation and rounding state to display precision. Deterministic replay is initially a same-build/runtime guarantee; bitwise equality of arbitrary floating-point library functions across every JS engine must be separately tested if required.

[ASSUMED] Close-approach guards, with source-relative speed $v_{{\rm rel},i}\ [\mathrm{m/s}]$, are:

$$
\Delta t\sqrt{\sum_i K_i/r_i^{p+1}}\le0.01\quad[1],\qquad
\Delta t\max_i(v_{{\rm rel},i}/r_i)\le0.01\quad[1].
$$

[ASSUMED] These are resolution heuristics, **not global accuracy tolerances**. At 400 km the primary dynamical time is about 2,012 s, so the first criterion alone permits about 20 s: far too loose for precise long forecasts. Prefer an encounter-wide fixed finer step, or deterministic powers-of-two substeps under a documented rule. State-dependent adaptive steps generally lose the strict fixed-step symplectic guarantee even when replay is deterministic. Recheck convergence and energy after changing that policy. Collision/strand crossing can require much finer time resolution than gravity; use swept collision and field-integration tests, not merely endpoint overlap.

[ASSUMED] Finite thrust is a nonconservative, mass-changing subsystem. Integrate mass flow and thrust with at least a consistent midpoint or split second-order method, sharing endpoint times with gravity; evolve attitude over the burn, clamp propellant at depletion, and split exactly at scheduled start/stop/depletion events. Do not claim the full powered/well simulation is symplectic or energy-conserving. Discontinuous well boundaries need event localization or a smooth profile. Reference gravity vectors intentionally do not certify burn scheduling, collisions or spacecraft systems.

[ASSUMED] Acceptance should cover positions, velocities, invariants **and event times**, with tolerances tied to the horizon and obstacle/ship dimensions. Halving Δt should reduce smooth-trajectory Verlet error by about four until roundoff dominates. Use isolated energy and h checks for a single source; total massive-body energy/momentum for a mutual binary; and Jacobi C for a massless ship in a circular binary. Do not demand constant inertial ship energy in the binary. Near-zero energy requires an absolute scale for normalization rather than division by ε ≈ 0.

[DEMONSTRATED: tools/physics/benchmark.mjs] The separate JavaScript research probe on Node v24.22.1 on this host propagated 100,000 binary-plus-ship steps in approximately 5 ms after warmup (one new force evaluation, three pair/source contributions per step, no allocation in the loop). It excludes UI, sensing, ship systems, collisions, workers and output sampling. This is evidence that the arithmetic budget is plausible, not a browser timing guarantee. The command prints current median/max timing and a state checksum; rerun on the target browser/hardware in 2A.

[DEMONSTRATED: tools/physics/benchmark.mjs] For its 10,000 s binary fixture, 1 s Verlet differed from 0.03125 s Verlet by about 6.8×10⁻⁵ m and 2.2×10⁻⁹ m/s. An isolated eccentric coast over twenty r₀ circular periods had peak relative energy error about 6.9×10⁻⁸ at 1 s, about four times larger at 2 s, without an increasing envelope in that run. Conversely, a 400 km circular orbit accumulated about **5.1 m** position/phase error over ten revolutions at 1 s despite tiny energy error. Do not extrapolate the easy binary fixture's tolerance to every horizon or close pass.

[ASSUMED] Budget no more than 20–30 ms of a 100 ms forecast response for gravity stepping, leaving the rest for systems, collision/field checks and rendering. Reuse arrays, precompute K, avoid per-tick objects, and keep samples/output decimated independently of integration. Two moving bodies plus a ship need three pair/source contributions per force evaluation; N independent asteroid forecasts add 2N contributions if both sources act on each. “10⁵ steps” must state particle count and sampling cost. Full asteroid-cloud forecasting may need bounded horizons or a worker. Measure the actual 2A implementation before accepting the budget.

## 8. Inverse Wells: bounded local thrust fiction

[FICTIONAL] A well changes only the **thrust-produced acceleration**, not gravity and not preexisting velocity. Let **c** be its center [m], $\mathbf e=(\mathbf x-\mathbf c)/|\mathbf x-\mathbf c|\ [1]$, nominal delivered engine acceleration $\mathbf a_T=F\mathbf u/m\ [\mathrm{m/s^2}]$, and influence $0\le w\le1\ [1]$. Apply:

$$
\mathbf a_{T,\rm well}=\mathbf a_T-2w(\mathbf a_T\cdot\mathbf e)\mathbf e
=\mathbf a_{T,\perp}+(1-2w)\mathbf a_{T,\parallel}
\quad[\mathrm{m\,s^{-2}}].
$$

[FICTIONAL] Inside w = 1, radial thrust reverses and tangential thrust is unchanged. Outside w = 0, ordinary response returns. At w = 1/2, radial control is zero; a player must cross that transition using existing velocity and tangential authority. Never reflect velocity when entering or leaving a well. Engine-off motion has no well correction. The field contributes unmodeled momentum and energy to ship plus exhaust, so ordinary closed-system momentum conservation is deliberately broken.

[ASSUMED] Profile choices:

| Profile | Definition | Implication |
|---|---|---|
| Hard boundary | w = 1 for r < R, 0 for r ≥ R; r and R in m | Simple, but force discontinuity needs event localization and stable boundary semantics |
| Recommended smooth annulus | w = 1 for r ≤ Rᵢₙ, w = 0 for r ≥ Rₒᵤₜ; between them set $s=(r-R_{in})/(R_{out}-R_{in})\ [1]$, $w=1-(6s^5-15s^4+10s^3)\ [1]$ | Continuous first and second derivatives; a real loss-of-radial-authority band |

[ASSUMED] Declare an excluded/collision core radius strictly above zero so the radial direction never becomes undefined; no arbitrary previous-frame direction at the center. An illustrative well might use Rᵢₙ = 40 km, Rₒᵤₜ = 50 km and a 1 km excluded core. At 100 m/s a 10 km transition takes about 100 s, long enough for observation and a finite burn. These dimensions need encounter testing. For overlapping wells choose exactly one active well by maximum w with stable ID tie-breaking, or disallow overlaps in content. Do not independently add several full corrections: that can amplify thrust and depends on ordering. If maximum selection causes direction discontinuities, separate the profiles or design a new smooth, norm-bounded combination explicitly.

[FICTIONAL] For one profile with 0 ≤ w ≤ 1, the transform has eigenvalues 1 and 1−2w, so $|\mathbf a_{T,\rm well}|\le F/m\ [\mathrm{m/s^2}]$. This prevents a local acceleration-gain exploit. The engine still consumes propellant at $F/(I_{sp}g_0)\ [\mathrm{kg/s}]$, even when radial response is canceled. With gravity excluded from the accounting, integrated thrust-induced speed change is bounded by $\int(F/m)dt=v_e\ln(m_i/m_f)\ [\mathrm{m/s}]$. Gravity can still exchange energy with the trajectory.

[FICTIONAL] Mechanical work need not have the ordinary engine-only value: the invented field's extra power is $P_{\rm field}=m\mathbf v\cdot(\mathbf a_{T,\rm well}-\mathbf a_T)\ [\mathrm W]$. It can be positive or negative. Thus do **not** assert global energy conservation or that all closed burn loops cost zero net energy. The bounded transform plus finite, always-consumed fuel removes perpetual acceleration from boundary crossing alone; it does not turn this fictional rule into a conservative physical theory.

[ASSUMED] Before accepting the encounter, check: engine-off repeated crossings leave velocity continuous; a full outward radial burn reverses while tangential burns do not; the midpoint blend cancels only radial thrust; total propellant is charged regardless of effective acceleration; repeated in/out burns cannot exceed the integrated thrust bound; overlaps cannot multiply authority; r near the excluded core remains finite; fixed input replay and halved-step event times agree. No hidden propulsion-energy regeneration or free refuel should be introduced by the well model.

## 9. Chain Link Fence: optional exposure formulation

[FICTIONAL] Treat the lattice as an authored radiation-like **damage field**, not measured ionizing-radiation dosimetry. Define every strand as a segment or curve in 3D, its finite layer envelope, and the flight plane. A planar ship can sample the genuine 3D distance to those strands; a visual strand passing above the flight plane should not automatically damage it. Crossings of multiple active layers add dose rates.

[ASSUMED] For layer ℓ, let $d_\ell(\mathbf x)\ [\mathrm m]$ be distance to the nearest strand centerline, $w_\ell\ [\mathrm m]$ the influence radius, $g_\ell(\mathbf x)\ [1]$ a compact layer envelope, and $\dot D_{0\ell}\ [\mathrm{DU/s}]$ its peak rate. DU is an authored damage-dose unit, **not gray or sievert**. One smooth, compact profile is:

$$
\dot D(\mathbf x)=\sum_\ell\dot D_{0\ell}g_\ell(\mathbf x)
\left[\max\left(0,1-\frac{d_\ell(\mathbf x)^2}{w_\ell^2}\right)\right]^4
\quad[\mathrm{DU/s}].
$$

[FICTIONAL] This gives exact zero exposure away from the strands and a steep rise nearby. Within one layer, “nearest strand” avoids counting a single lattice junction twice; between different layers contributions add. If a different junction rule is desired, state it in content. Severity comes from integrating actual dose along the trajectory, not a random survival roll or a universal hit counter.

[ASSUMED] At least sample the hull center, both ends, radiator/array extremities and critical electrical components, transformed from body coordinates using actual attitude/configuration. For component c with weighted quadrature points $\mathbf x_{cj}\ [\mathrm m]$, $w_{cj}\ge0,\ \sum_jw_{cj}=1\ [1]$, evolve:

$$
\dot D_c=\sum_jw_{cj}\dot D(\mathbf x_{cj})\quad[\mathrm{DU/s}],\qquad
D_c(t)=\int_0^t\dot D_c\,dt'\quad[\mathrm{DU}].
$$

[ASSUMED] Critical exposed hardware needs its own local dose/condition, not dilution in a whole-ship average. An extremity or conservative swept footprint must detect narrow strands between sparse points. Halve both spatial sample spacing and exposure time step until component dose converges; require crossing displacement per substep well below the smallest field width, or integrate a swept segment analytically. Retraction changes the footprint and potentially cooling/sensing, as determined by the ship model.

[FICTIONAL] For an ideal straight crossing through one isolated strand with impact offset zero, constant normal speed $v_\perp\ [\mathrm{m/s}]$, and constant layer envelope 1, the profile above integrates to $D_{\rm crossing}=(256/315)\dot D_0w/|v_\perp|\ [\mathrm{DU}]$. A slower crossing increases dose. This is a testable field integral, not a universal dose per hit; offset, layer envelope and extended components alter it.

[ASSUMED] A transparent blind-traversal estimate can be made only after specifying geometry and a lethal-dose criterion. Under P1 a transverse layer has **one free aim coordinate**. Suppose N layers intersect the flight plane in periodic forbidden intervals of spacing s [m], with independent, uniformly distributed transverse offsets. Let the ship's swept footprint and severe-contact margin give each interval a combined half-width b [m], with b < s/2. At one layer the probability of avoiding that region is $q_{\rm safe}=1-2b/s\ [1]$, hence $P_{\rm no\ severe}=q_{\rm safe}^{N}\ [1]$. Independence is an ensemble assumption about unknown authored layer offsets, not runtime randomness. Include the lateral sweep across a finite layer's thickness in b; a point at the layer center alone is insufficient.

[ASSUMED] For s = 1,000 m and effective severe margin b = 200 m, qsafe = 0.6 [1]. Six layers give 4.666%, ten give 0.605%, and twelve give **0.218%** avoidance of all severe regions. If any severe intersection at the chosen speed disables a critical component, these are optimistic survival estimates: cumulative lesser doses can only reduce survival under that assumption. If severe contact is sometimes survivable, they estimate severe-contact avoidance only, not survival; integrate dose and condition to get survival. Changing layer phases, ship attitude, speed or clearance changes the estimate.

[ASSUMED] Do not substitute a 3D square-opening area fraction for the available clear width in the actual planar slice. Aligned/copied layers, strands parallel to the path, correlated offsets, or a layer whose slice contains no opening invalidate the example. Once geometry is authored, sample deterministic blind straight paths using the project's seeded streams and integrate component doses; also explicitly search for traversable openings. The formula alone proves neither “extraordinarily unlikely” for the final content nor that a safe navigable path exists.

## 10. Reference vectors, verification and limits

[ASSUMED] [physics.json](../../tests/vectors/physics.json) is the machine-readable gravity reference. [tools/physics/README.md](../../tools/physics/README.md) defines quantities, units, solver settings and comparison semantics. The Python generator uses only the standard library, includes both p = 2 and p = 2.5, and supplies isolated and mutually moving binary trajectory checkpoints. All starts, body strengths, epochs and normalization values needed to reproduce the cases are in the file. No installed scientific package or production simulator is required.

[ASSUMED] Run these from the repository root; the generator's check path does not rewrite its committed output:

```text
python tools/physics/generate_vectors.py --check
python tools/physics/generate_vectors.py --report
node tools/physics/benchmark.mjs
```

[ASSUMED] Closed-form limits, high-accuracy reference states, tighter-solver agreement, analytic Newtonian/circular controls and conservation checks serve different purposes. A tighter rerun of one adaptive method is useful convergence evidence, not an independent proof of correctness. The separate Verlet probe checks another integration method; Phase 2A and the Newtonian GMAT package provide further independent checks. Per-case tolerances are absolute SI comparison tolerances, not a license to label every forecast correct at that error for every horizon.

[ASSUMED] Limits and open questions for the integrator:

- Adopt one universal r₀, fixed μ/K semantics, point-center gravity and collision envelopes in P4/contracts. Preserve P1; this derivation supplies no reason to reject planar motion.
- Reconcile the proposed masses/radii, 30 t / 20 kN / 320 s ship assumptions, electrical/thermal examples, fuel reserve and encounter duration with 1C/1F. Only playtests can establish the actual route and pacing.
- Choose binary initial phase/eccentricity and asteroid population. Constant rotating equilibria/Jacobi tests apply only to the circular baseline; an eccentric binary requires time-dependent propagation.
- Confirm sensor uncertainty and available range/geometry variation in 1G. An exact single-radius circular observation does not identify p; model identifiability is not automatic.
- Measure browser performance and convergence at real forecast horizons, close passes, collisions, burns, well boundaries and lattice widths. The gravity arithmetic benchmark excludes those costs.
- Decide Inverse Wells core/overlap/measurement semantics and any field energy bookkeeping. The proposed rule is intentionally nonconservative; no changes to ordinary thermal/electrical physics follow from it.
- Choose actual lattice geometry, component dose curves and failure thresholds. The blind-traversal probability is conditional and must be recomputed for the authored planar passage.

[ASSUMED] Changes to the force law, softening, r₀ convention or vector semantics require regenerating/reviewing the reference package. No files under `src/`, shared contracts, the creative brief or the decisions log are modified by 1B.
