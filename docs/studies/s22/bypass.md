# S22 — what going around actually costs

## The result that must not be hidden

[DEMONSTRATED: `vectors.json.bypasses`] A finite compact field does **not** make
distance proportional to propellant. Outside all reserved bounds the pull and
reversal are exactly zero. Stop the incoming 35 m/s ship, travel slowly around
the formation, and restore its forward speed. A wider field makes the coasts
longer without increasing their fuel use.

The reference starts at S16's upstream skirt, `(-100,0,0) km` with velocity
`(35,0,0) m/s`, mass 30,374 kg. It performs finite 24 kN burns, not instantaneous
velocity jumps. After stopping, its three exterior legs pass through
`(x_stop,1450,0) km`, `(1450,1450,0) km`, and `(1450,0,0) km`. It restores 35 m/s
at the exit. Every burn/coast segment clears **all 2,601 reserved bounding balls**
by at least **37.963 km**, including the dormant sites after birth. Fixed-axis
burns have monotone straight spatial segments, so the segment minimum is an
exact spatial check in this zero-field region. Each turn has a 480 s slot;
actual attitude/holding propellant, power and thermal endurance remain untested.

| Exterior leg speed | Integrated main impulse | Main required | Duration | Relative to 1,000 / 6,000 kg |
| --- | ---: | ---: | ---: | --- |
| 1 m/s | 76 m/s | 726.769 kg | 51.519 days | 72.7% / 12.1% |
| 35 m/s | 280 m/s | 2,592.737 kg | 35.904 h | 259.3% / 43.2% |
| 125 m/s | 820 m/s | 6,984.559 kg | 10.558 h | 698.5% / 116.4% |

[DEMONSTRATED: `finite_bypass()`] The impulse is `70 + 6*v_leg`: stop and restore
35 m/s, plus accelerate and brake for each of three legs. Propellant follows
`m0*(1-exp(-dv/ve))`. The 125 m/s plan is a **hypothetical cost calculation**,
not an executable baseline flight: it would consume more fuel than exists and
end below dry mass. The first two are translation witnesses only. Costs at
1 m/s approach a finite limit as leg speed approaches zero, while duration
diverges. Neither count can be advertised as the cheapest possible route.

[DEMONSTRATED: comparison] The nominal through routes use 122.366 kg and take
6.439 / 6.642 h. Thus the 35 m/s exterior example costs **21.19 times** the
nominal through burn, and the slow exterior example **5.94 times**. The latter
is essentially the **same fuel cost as S16**, not an improvement over its
727 kg bypass. Endpoint transverse position and velocity also differ: the
through routes cross a 350 km exit disc, whereas the displayed detour returns
to its centre. A strict identical-state comparison requires exit trimming and
the actual continuation to P04; it has not been computed here.

## A conditional lower bound, with its limits

[DEMONSTRATED: `conditional_exterior_time_bound`] There is a useful exact bound
for a deliberately defined class of detours. Suppose the ship stays outside the
**reserved box envelope**, starts with zero transverse velocity/position and
ends with zero transverse velocity within the 350 km exit disc. It must attain
at least `D=1,349,622.024 m` in one transverse coordinate. The end coordinate
can be at most `b=350,000 m` in that direction.

For excursion time `tau` within total time `T`, outward and inward peak speeds
must be at least `D/tau` and `(D-b)/(T-tau)`. Starting and ending at rest requires
at least twice the sum of these peaks in total variation of that velocity.
Minimizing over `tau` gives

```text
J_transverse >= 2 (sqrt(D) + sqrt(D-b))² / T
```

For `T=23,179.902 s`, the faster nominal crossing duration, this lower bound is
**403.131 m/s**, equivalent to **3,661.685 kg** with only the baseline main engine.
It ignores all axial steering and finite-thrust limitations, so those cannot
make this particular bound cheaper. RCS/ion contributions must be treated
separately before interpreting it as an all-propulsion resource bound. It is
not a required arrival time or a new game deadline.

**Crucial limitations:** the reserved box is an authoring envelope, not a solid
obstacle. A physical trajectory can pass through gaps inside it, or cut between
the enclosing spheres without touching a funnel. The bound applies only to
the defined exterior route class, endpoint velocity condition and elapsed time.
It does not establish the least-cost avoidance of the actual funnels. The
nominal through routes do not meet its zero-transverse-exit-velocity condition.

## Why appearing wells do not close the proof

[ASSUMED] Births occupy pre-reserved, mutually separated sites. A warned ship may
wait, turn, or exploit a cancelled birth. Those are allowed physical outcomes,
not exploits to suppress. A finite number of finite compact supports still fits
in a finite box; a path sufficiently far outside it feels no new force. Reserving
more sites changes distance but cannot remove the slow exterior construction.
The supplied layout also has ordinary gaps between bounding spheres, making a
universal “every flight must learn reversal” claim especially unjustified.

[ESTABLISHED: DECISIONS P14, A12; phase-3 §3A] Life support is not a consumable
clock, and sustainable illuminated preparation is intended. The study cannot
assume that a 51-day coast kills the player by oxygen, battery or an invisible
timer. If real equipment cannot sustain that coast, measure its actual
generation/load/cooling/consumable deficit; do not infer it from travel time.
Tiny navigation corrections or wear may matter over such time, but their
integrated cost must be demonstrated before declaring this route unaffordable.

[ASSUMED] **Recommendation to the owner:** accept a large, beautiful and locally
dangerous field with expensive *timely* exterior alternatives, while keeping
slow bypasses physically valid. If that fails the desired encounter purpose,
request a separate physical transfer/energy-containment design and require a
global route comparison under its stated boundary conditions. “From anywhere
else” cannot be a universal fuel claim without specifying initial and final
states: a ship already beside the outgoing transit can spend virtually nothing.

This is the material unresolved design requirement, not a failed numerical
test to hide or a reason to replace the owner's real funnels with invisible walls.
