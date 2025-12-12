# Poll Options Modification Plan

## ✅ STATUS: COMPLETED

This implementation plan has been successfully completed. All phases have been implemented and tested.

## Overview
Modify the voting system to allow the activity initiator to choose between a predefined list of options or create a custom list, instead of having participants self-register.

---

## ~~Current Flow (To Be Changed)~~ → CHANGED ✅
1. Initiator starts activity
2. Each participant registers themselves by entering their name
3. Participants vote from the list of registered users
4. Results are displayed

## New Flow → IMPLEMENTED ✅
1. Initiator chooses between:
   - **Predefined list** (from JSON file with hardcoded names)
   - **Custom list** (enter names in textarea, one per line)
2. Initiator starts activity with the chosen list
3. All participants see the same poll options (no registration needed)
4. Participants vote from the predefined options
5. Results are displayed

---

## Step-by-Step Implementation Plan

### Phase 1: Create Predefined Options JSON File

#### Step 1.1: Create JSON file with predefined options
- [ ] Create file: `src/data/predefinedOptions.json`
- [ ] Structure:
  ```json
  {
    "lists": [
      {
        "id": "default",
        "name": "Llista per defecte",
        "description": "Noms predefinits per a la votació",
        "options": [
          "Participant 1",
          "Participant 2",
          "Participant 3"
        ]
      }
    ]
  }
  ```
- [ ] Use Catalan names and descriptions
- [ ] Keep format simple and extensible

**Files to create:**
- `src/data/predefinedOptions.json`

**Expected outcome:** JSON file with predefined voting options

---

### Phase 2: Update Type Definitions

#### Step 2.1: Add new types for poll options
- [ ] Open `src/types/poll.types.ts`
- [ ] Add `PollOption` type:
  ```typescript
  export type PollOption = {
    id: string;
    name: string;
  };
  ```
- [ ] Update `PollState` to use `PollOption[]` instead of `Participant[]`
- [ ] Add `PollOptionsSource` type:
  ```typescript
  export type PollOptionsSource = 'predefined' | 'custom';
  ```
- [ ] Add `PredefinedList` type:
  ```typescript
  export type PredefinedList = {
    id: string;
    name: string;
    description: string;
    options: string[];
  };
  ```

**Files to modify:**
- `src/types/poll.types.ts`

**Expected outcome:** Updated type definitions to support poll options instead of participants

---

### Phase 3: Update Utility Functions

#### Step 3.1: Update vote calculation functions
- [ ] Open `src/utils/voteCalculations.ts`
- [ ] Update `calculateResults()` to work with `PollOption[]` instead of `Participant[]`
- [ ] Function signature changes:
  ```typescript
  export function calculateResults(
    votes: Vote[],
    options: PollOption[]  // Changed from participants
  ): VoteResults
  ```
- [ ] Update result types accordingly
- [ ] Test that vote counting still works correctly

**Files to modify:**
- `src/utils/voteCalculations.ts`

**Expected outcome:** Vote calculations work with poll options

---

### Phase 4: Modify Setup Side Panel

#### Step 4.1: Add option selection UI
- [ ] Open `src/app/sidepanel/page.tsx`
- [ ] Add state for option selection:
  ```typescript
  const [optionsSource, setOptionsSource] = useState<'predefined' | 'custom'>('predefined');
  const [customOptions, setCustomOptions] = useState('');
  const [selectedPredefinedList, setSelectedPredefinedList] = useState('default');
  ```
- [ ] Import predefined options from JSON file
- [ ] Add UI section before "Començar votació" button

**UI Structure:**
```
[Radio button] Utilitzar llista predefinida
  [Dropdown] Select predefined list

[Radio button] Crear llista personalitzada
  [Textarea] Enter options (one per line)

[Preview section] Shows selected/entered options

[Començar votació button]
```

#### Step 4.2: Parse custom options
- [ ] Add function to parse textarea content:
  ```typescript
  function parseCustomOptions(text: string): PollOption[] {
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map((name, index) => ({
        id: `option_${Date.now()}_${index}`,
        name: name
      }));
  }
  ```
- [ ] Validate that at least 2 options are provided
- [ ] Show error if validation fails

#### Step 4.3: Update startVoting function
- [ ] Get poll options based on source:
  - If predefined: Load from JSON file
  - If custom: Parse textarea
- [ ] Convert options to `PollOption[]` format
- [ ] Pass options in `additionalData` as part of `PollState`
- [ ] Update `PollState` structure:
  ```typescript
  const pollState: PollState = {
    options: pollOptions,  // Changed from participants
    votes: [],
    status: 'voting',
    question: "Qui és l'artista d'avui?",
    pollId: generatePollId(),
    round: 1,
  };
  ```

**Files to modify:**
- `src/app/sidepanel/page.tsx`

**Expected outcome:** Initiator can choose and configure poll options before starting

---

### Phase 5: Update Activity Side Panel (Remove Registration)

#### Step 5.1: Remove registration form
- [ ] Open `src/app/activitysidepanel/page.tsx`
- [ ] Remove all registration-related code:
  - `participantName` state
  - `isRegistered` state
  - `handleRegistration` function
  - Registration form UI
- [ ] Remove participant message broadcasting
- [ ] Remove listener for `PARTICIPANT_JOINED` messages

#### Step 5.2: Update voting interface
- [ ] Remove registration step entirely
- [ ] Show poll options immediately
- [ ] Get options from `pollState.options` (received from starting state)
- [ ] Update `ParticipantList` component usage:
  ```typescript
  <ParticipantList
    participants={pollState.options}  // Now using options instead
    selectedParticipantId={selectedOptionId}
    onSelect={setSelectedOptionId}
  />
  ```
- [ ] Update vote submission to use option ID instead of participant ID

#### Step 5.3: Generate anonymous voter ID
- [ ] When component loads, generate unique voter ID:
  ```typescript
  const [voterId] = useState(() => generateParticipantId());
  ```
- [ ] Use this ID for vote tracking
- [ ] Vote object structure:
  ```typescript
  const vote: Vote = {
    voterId: voterId,
    voterName: 'Anònim', // Or generate anonymous name
    selectedParticipantId: selectedOptionId,
    timestamp: Date.now(),
  };
  ```

**Files to modify:**
- `src/app/activitysidepanel/page.tsx`

**Expected outcome:** No registration needed, voting happens immediately with poll options

---

### Phase 6: Update Main Stage

#### Step 6.1: Update state management
- [ ] Open `src/app/mainstage/page.tsx`
- [ ] Change `participants` state to `options` state:
  ```typescript
  const [options, setOptions] = useState<PollOption[]>([]);
  ```
- [ ] Update `setStartingState` to load options instead of participants
- [ ] Remove `PARTICIPANT_JOINED` message handling
- [ ] Keep `VOTE_CAST` message handling

#### Step 6.2: Update vote calculation
- [ ] Update `calculateResults` call:
  ```typescript
  const calculatedResults = calculateResults(votes, options);
  ```
- [ ] Update useEffect dependency:
  ```typescript
  useEffect(() => {
    if (options.length > 0) {
      const calculatedResults = calculateResults(votes, options);
      setResults(calculatedResults);
    }
  }, [votes, options]);
  ```

#### Step 6.3: Update waiting state UI
- [ ] Change "Esperant que els participants es registrin..."
- [ ] To: "Esperant vots dels participants..."
- [ ] Update empty state handling

**Files to modify:**
- `src/app/mainstage/page.tsx`

**Expected outcome:** Main stage displays results based on poll options, not registered participants

---

### Phase 7: Update Components

#### Step 7.1: Update ParticipantList component
- [ ] Open `src/components/ParticipantList.tsx`
- [ ] Rename component to `OptionList` (or keep name but update internally)
- [ ] Update prop types to accept `PollOption[]`
- [ ] Update empty state message: "No hi ha opcions disponibles"
- [ ] Update label: "Selecciona una opció:"

**Files to modify:**
- `src/components/ParticipantList.tsx`

**Expected outcome:** Component displays poll options instead of participants

#### Step 7.2: Update VoteResults component
- [ ] Open `src/components/VoteResults.tsx`
- [ ] Ensure it works with the updated data structure
- [ ] Update any participant-specific language to option language
- [ ] Results should still show vote counts, percentages, and bars

**Files to modify:**
- `src/components/VoteResults.tsx`

**Expected outcome:** Results display correctly with poll options

---

### Phase 8: Styling and Polish

#### Step 8.1: Style the option selection UI
- [ ] Add proper spacing and layout for radio buttons
- [ ] Style dropdown for predefined list selection
- [ ] Style textarea for custom options (monospace font, proper height)
- [ ] Add preview section styling
- [ ] Ensure responsive design

#### Step 8.2: Add helpful hints
- [ ] Add placeholder text to textarea: "Introdueix una opció per línia"
- [ ] Add helper text showing number of options entered
- [ ] Add validation messages in Catalan
- [ ] Show example in empty state

#### Step 8.3: Update all UI text
- [ ] Ensure all text remains in Catalan
- [ ] Update any "participant" references to "option" or "opció"
- [ ] Review all user-facing messages

**Expected outcome:** Polished, professional UI in Catalan

---

### Phase 9: Testing

#### Step 9.1: Test predefined list flow
- [ ] Start activity with predefined list
- [ ] Verify all participants see the same options
- [ ] Cast votes
- [ ] Verify results are correct

#### Step 9.2: Test custom list flow
- [ ] Enter custom options (3-5 options)
- [ ] Test with different line breaks and spacing
- [ ] Test with special characters in names
- [ ] Verify options appear correctly for all participants
- [ ] Cast votes
- [ ] Verify results are correct

#### Step 9.3: Test edge cases
- [ ] Test with 2 options (minimum)
- [ ] Test with 10+ options
- [ ] Test with very long option names
- [ ] Test with empty lines in custom textarea
- [ ] Test validation errors
- [ ] Test multiple consecutive line breaks

#### Step 9.4: Test vote flow
- [ ] Verify voting is immediate (no registration)
- [ ] Test vote confirmation works
- [ ] Test results update in real-time
- [ ] Test tie detection still works
- [ ] Verify winner announcement

**Expected outcome:** All scenarios tested and working correctly

---

### Phase 10: Update Documentation

#### Step 10.1: Update IMPLEMENTATION_SUMMARY.md
- [ ] Document the new poll options approach
- [ ] Update flow diagrams
- [ ] Explain predefined vs custom lists
- [ ] Update file structure

#### Step 10.2: Update TESTING_GUIDE.md
- [ ] Add testing scenarios for option selection
- [ ] Update test flows
- [ ] Add edge case tests for custom options

#### Step 10.3: Update claude.md
- [ ] Update project overview
- [ ] Document JSON file structure
- [ ] Update implementation approach
- [ ] Remove participant registration references

**Files to modify:**
- `IMPLEMENTATION_SUMMARY.md`
- `TESTING_GUIDE.md`
- `claude.md`

**Expected outcome:** Complete documentation of the new approach

---

## Summary of Key Changes

### Files to Create:
1. `src/data/predefinedOptions.json` - Predefined voting options

### Files to Modify:
1. `src/types/poll.types.ts` - Update types for poll options
2. `src/utils/voteCalculations.ts` - Update to work with options
3. `src/app/sidepanel/page.tsx` - Add option selection UI
4. `src/app/activitysidepanel/page.tsx` - Remove registration, direct voting
5. `src/app/mainstage/page.tsx` - Update to use options instead of participants
6. `src/components/ParticipantList.tsx` - Update for poll options
7. `src/components/VoteResults.tsx` - Ensure compatibility
8. Documentation files

### Files to Remove:
- None (keep existing components for potential reuse)

---

## Benefits of This Approach

✅ **Simpler user flow** - No registration step
✅ **More control** - Initiator defines options
✅ **Faster voting** - Participants vote immediately
✅ **Flexible** - Supports both predefined and custom lists
✅ **Reusable** - Can save multiple predefined lists
✅ **Clear options** - No ambiguity about who to vote for

---

## Potential Enhancements (Future)

- Multiple predefined lists in JSON file
- Ability to edit predefined list before starting
- Save custom lists for future use
- Import options from file
- Randomize option order
- Add option descriptions/photos

---

## Migration Notes

### Breaking Changes:
- Removes participant self-registration
- Changes from `Participant[]` to `PollOption[]`
- Updates `PollState` structure

### Backward Compatibility:
- Not compatible with old poll sessions
- Need to restart any in-progress polls

---

## Estimated Time

- **Phase 1-2 (Setup & Types)**: 30 minutes
- **Phase 3 (Utilities)**: 20 minutes
- **Phase 4 (Setup Side Panel)**: 1-2 hours
- **Phase 5 (Activity Side Panel)**: 1 hour
- **Phase 6 (Main Stage)**: 45 minutes
- **Phase 7 (Components)**: 30 minutes
- **Phase 8 (Styling)**: 1 hour
- **Phase 9 (Testing)**: 1-2 hours
- **Phase 10 (Documentation)**: 30 minutes

**Total**: 6-8 hours

---

## Order of Implementation

1. Phase 1 (JSON file) ← Start here
2. Phase 2 (Types)
3. Phase 3 (Utilities)
4. Phase 4 (Setup panel)
5. Phase 5 (Activity panel)
6. Phase 6 (Main stage)
7. Phase 7 (Components)
8. Phase 8 (Polish)
9. Phase 9 (Testing)
10. Phase 10 (Documentation)

---

**Status**: Ready to implement
**Created**: 2025-11-28
**Approved**: Pending
