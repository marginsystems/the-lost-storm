------------------------------ MODULE Overlays ------------------------------
EXTENDS Naturals, FiniteSets

CONSTANT CURRENT

Overlays == {"inventory", "character", "trade", "chart", "map", "ladder",
             "choice", "reader", "endcard", "pause", "death"}
Side == {"inventory", "character", "trade"}
Full == {"chart", "map", "ladder"}
Keyed == {"inventory", "character", "chart", "map", "ladder", "pause"}
Blockers == {"reader", "endcard", "pause", "death"}
Queued == {"choice", "endcard"}
Pairs == {{"inventory", "character"}, {"inventory", "trade"}}
Rank == [o \in Overlays |->
          CASE o = "character" -> 1 [] o = "inventory" -> 2 [] o = "trade" -> 3
            [] o = "chart" -> 4 [] o = "map" -> 5 [] o = "ladder" -> 6
            [] o = "choice" -> 7 [] o = "reader" -> 8 [] o = "endcard" -> 9
            [] o = "pause" -> 10 [] o = "death" -> 11]
Phases == {"closed", "opening", "open", "closing"}

CurrentPanels == {"inventory", "character", "chart", "map"}
CurrentFull == {"map"}

VARIABLES phase, pending, waiting, chrome, simFlag
vars == <<phase, pending, waiting, chrome, simFlag>>

Shown(o) == phase[o] \in {"opening", "open"}
Visible == {o \in Overlays : Shown(o)}
Exiting == {o \in Overlays : phase[o] = "closing"}
Live == {o \in Overlays : phase[o] # "closed"}
Compatible(S) == Cardinality(S) <= 1 \/ S \in Pairs
Top(S) == CHOOSE o \in S : \A x \in S : Rank[x] <= Rank[o]
WithDependents(S) == IF "inventory" \in S THEN S \cup {"trade"} ELSE S

HidingFull == IF CURRENT THEN CurrentFull ELSE Full
ChromeOf(p) == IF \E f \in HidingFull : p[f] # "closed" THEN "hidden" ELSE "shown"
FlagOf(p) == \E o \in Overlays : p[o] # "closed"

Settle(p, q) ==
  /\ phase' = p
  /\ pending' = q
  /\ chrome' = ChromeOf(p)
  /\ simFlag' = FlagOf(p)

Target(o) ==
  {o} \cup (IF o = "trade" THEN {"inventory"} ELSE {})
      \cup {v \in Visible : {v, o} \in Pairs}

Displaced(o) ==
  IF CURRENT
  THEN IF o \in CurrentPanels
       THEN {v \in Visible \cap CurrentPanels : v # o /\ (o \in CurrentFull \/ v \in CurrentFull)}
              \cup (IF o = "character" THEN Visible \cap {"trade"} ELSE {})
       ELSE {}
  ELSE WithDependents(Visible \ Target(o)) \cap Visible

Blocked(o) == \E b \in Blockers : b # o /\ (Shown(b) \/ b \in pending)

Accept(o) ==
  LET out == Displaced(o)
      entering == Target(o) \ Visible
      exiting == Exiting \cup out
  IN IF CURRENT \/ exiting = {}
     THEN Settle([x \in Overlays |-> IF x \in out THEN "closing"
                                     ELSE IF x \in entering THEN "opening"
                                     ELSE phase[x]], {})
     ELSE Settle([x \in Overlays |-> IF x \in out THEN "closing" ELSE phase[x]], entering)

Request(o) ==
  /\ ~Shown(o)
  /\ o \notin pending
  /\ IF Blocked(o) /\ ~CURRENT THEN UNCHANGED vars ELSE Accept(o) /\ UNCHANGED waiting

Dismiss(o) ==
  /\ Shown(o) \/ o \in pending
  /\ LET out == WithDependents({o}) \cap Visible
     IN Settle([x \in Overlays |-> IF x \in out THEN "closing" ELSE phase[x]],
               pending \ WithDependents({o}))

Toggle(o) ==
  /\ IF Shown(o) \/ o \in pending THEN Dismiss(o) /\ UNCHANGED waiting ELSE Request(o)

CloseButton(o) ==
  /\ o # "death"
  /\ Dismiss(o)
  /\ UNCHANGED waiting

EscapeTarget ==
  IF CURRENT /\ Shown("ladder") THEN "ladder" ELSE Top(Visible \ {"death"})

Escape ==
  \/ /\ Visible \ {"death"} # {}
     /\ IF CURRENT /\ ~Shown("ladder") /\ Visible \cap (CurrentPanels \cup {"trade", "choice"}) # {}
        THEN Settle([x \in Overlays |-> IF x \in Visible \cap (CurrentPanels \cup {"trade", "choice"}) THEN "closing" ELSE phase[x]], pending)
        ELSE Dismiss(EscapeTarget)
     /\ UNCHANGED waiting
  \/ /\ Visible = {}
     /\ pending \ {"death"} # {}
     /\ Settle(phase, pending \cap {"death"})
     /\ UNCHANGED waiting
  \/ /\ Visible = {}
     /\ pending = {}
     /\ Request("pause")

AnimDone(o) ==
  \/ /\ phase[o] = "opening"
     /\ Settle([phase EXCEPT ![o] = "open"], pending)
     /\ UNCHANGED waiting
  \/ /\ phase[o] = "closing"
     /\ LET done == [phase EXCEPT ![o] = "closed"]
        IN IF Exiting = {o} /\ pending # {}
           THEN Settle([x \in Overlays |-> IF x \in pending THEN "opening" ELSE done[x]], {})
           ELSE Settle(done, pending)
     /\ UNCHANGED waiting

Death ==
  /\ ~Shown("death")
  /\ "death" \notin pending
  /\ IF CURRENT
     THEN Settle([phase EXCEPT !["death"] = "opening"], pending)
     ELSE IF Live = {}
          THEN Settle([phase EXCEPT !["death"] = "opening"], {})
          ELSE Settle([x \in Overlays |-> IF x \in Visible THEN "closing" ELSE phase[x]], {"death"})
  /\ UNCHANGED waiting

Respawn ==
  /\ phase["death"] = "open"
  /\ Dismiss("death")
  /\ UNCHANGED waiting

ZoneChange ==
  /\ IF CURRENT
     THEN UNCHANGED <<phase, pending, chrome, simFlag>>
     ELSE Settle([x \in Overlays |-> IF x \in Visible \ {"death"} THEN "closing" ELSE phase[x]],
                 pending \cap {"death"})
  /\ UNCHANGED waiting

Arrive(m) ==
  /\ m \notin waiting
  /\ phase[m] = "closed"
  /\ waiting' = waiting \cup {m}
  /\ UNCHANGED <<phase, pending, chrome, simFlag>>

Present ==
  /\ "endcard" \in waiting
  /\ CURRENT \/ (Live = {} /\ pending = {})
  /\ ~Shown("endcard")
  /\ Settle([phase EXCEPT !["endcard"] = "opening"], pending)
  /\ waiting' = waiting \ {"endcard"}

OpenChoice ==
  /\ "choice" \in waiting
  /\ Request("choice")

Choose ==
  /\ phase["choice"] = "open"
  /\ Settle([phase EXCEPT !["choice"] = "closing"], pending)
  /\ waiting' = waiting \ {"choice"}

Init ==
  /\ phase = [o \in Overlays |-> "closed"]
  /\ pending = {}
  /\ waiting = {}
  /\ chrome = "shown"
  /\ simFlag = FALSE

Next ==
  \/ \E o \in Keyed : Toggle(o)
  \/ \E o \in Overlays : CloseButton(o)
  \/ Escape
  \/ \E o \in Overlays : AnimDone(o)
  \/ Request("trade")
  \/ Request("reader")
  \/ Death
  \/ Respawn
  \/ ZoneChange
  \/ \E m \in Queued : Arrive(m)
  \/ Present
  \/ OpenChoice
  \/ Choose

Spec == Init /\ [][Next]_vars /\ \A o \in Overlays : WF_vars(AnimDone(o))

TypeOK ==
  /\ phase \in [Overlays -> Phases]
  /\ pending \subseteq Overlays
  /\ waiting \subseteq Queued
  /\ chrome \in {"shown", "hidden"}
  /\ simFlag \in BOOLEAN

OneExclusive == Compatible(Visible)

ExitBeforeEntry ==
  \A a \in Exiting, b \in Overlays : phase[b] = "opening" => {a, b} \in Pairs

FullHidesChrome == (\E f \in Full : phase[f] # "closed") => chrome = "hidden"

NoIdleGap == pending # {} => Exiting # {}

QueuedOneAtATime == ~(phase["choice"] # "closed" /\ phase["endcard"] # "closed")

DeathAlone == Shown("death") => Live = {"death"}

FlagMatches == simFlag = (Live # {})

EscapeTopFirst ==
  [][Escape /\ Visible \ {"death"} # {} /\ ~Shown("pause")
       => ~Shown("pause")' /\ "pause" \notin pending']_vars

EscapeClosesOnlyTop ==
  [][Escape /\ Visible \ {"death"} # {}
       => Visible' = Visible \ WithDependents({Top(Visible \ {"death"})})]_vars

ZoneLeavesNoOrphan ==
  [][ZoneChange => Visible' \subseteq {"death"} /\ pending' \subseteq {"death"}]_vars

DeathNeverDropped ==
  [][("death" \in pending) => ("death" \in pending' \/ Shown("death")')]_vars

DeathShows == ("death" \in pending) ~> Shown("death")

NothingLost ==
  \A o \in Overlays :
    (o \in pending \/ phase[o] = "opening") ~> (o \notin pending /\ phase[o] # "opening")
=============================================================================
