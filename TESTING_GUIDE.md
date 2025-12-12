# Testing Guide: Artist Vote Add-on

This guide provides instructions for testing the Artist Vote add-on locally and in Google Meet.

---

## Local Testing

### Prerequisites
- Node.js installed
- Repository cloned
- Dependencies installed (`npm install`)

### Start Development Server

```bash
# Set environment variable for local development
export NEXT_PUBLIC_DEBUG=1

# Start the server
npm run dev
```

The server will start at: **http://localhost:3000**

### Test Each Page

#### 1. **Screenshare Landing Page**
- Navigate to: http://localhost:3000
- **Expected**: Colorful landing page with playful theme
- **Check**:
  - Title: "Votació de l'Artista"
  - Confetti/playful background
  - Instructions in Catalan
  - Hand-drawn border effects
  - Responsive design

#### 2. **Setup Side Panel**
- Navigate to: http://localhost:3000/sidepanel
- **Expected**: Setup interface with playful styling
- **Check**:
  - Radio buttons for predefined vs custom options
  - Dropdown with 3 lists: Mortensen, Dev, Disseny
  - Textarea for custom options
  - Preview section showing selected options
  - "Començar votació" button
  - Hand-drawn card borders
  - Crayon color accents

**Note**: In local testing without Meet SDK, the button will remain disabled. This is expected behavior.

#### 3. **Activity Side Panel**
- Navigate to: http://localhost:3000/activitysidepanel
- **Expected**: Voting interface with playful theme
- **Check**:
  - Poll question displays with fun styling
  - Options list with colorful cycling colors
  - Vote button with playful shadow
  - All text in Catalan

**Note**: Without Meet SDK context, this will show a loading state. This is expected.

#### 4. **Main Stage**
- Navigate to: http://localhost:3000/mainstage
- **Expected**: Results display with playful styling
- **Check**:
  - Confetti background effect
  - Hand-drawn vote counter box
  - Loading state appears
  - Layout is responsive
  - Dark mode works

**Note**: Without Meet SDK context, this will show a loading state. This is expected.

---

## Google Meet Testing

### Prerequisites

1. **Google Cloud Project**: Must have Cloud Project Number: `315905898182` configured
2. **Meet Add-on**: Must be registered in Google Workspace Marketplace
3. **HTTPS**: Must deploy to HTTPS URL (localhost won't work in Meet)
4. **Multiple Accounts**: Need at least 2-3 Google accounts for full testing

### Deployment Options

#### Option 1: GitHub Pages (Recommended)
```bash
# Build for production
npm run build

# Deploy to GitHub Pages
# (Follow GitHub Pages deployment process)
```
Production URL: https://we-are-mortensen.github.io/meet-artist-vote-app

#### Option 2: Local HTTPS (for testing)
```bash
# Install mkcert for local HTTPS
brew install mkcert
mkcert -install

# Create certificates
mkcert localhost

# Start with HTTPS
# (Configure Next.js for HTTPS or use ngrok)
```

### Testing Flow

#### Step 1: Start a Google Meet Call
1. Create a new Google Meet call
2. Join with your primary account
3. Have at least one other participant join (or join with a second device/account)

#### Step 2: Share the Add-on
1. In the Meet call, start screen sharing
2. Select the browser tab with: https://your-deployment-url.com
3. **Expected**: Google Meet prompts to install/open the add-on
4. Click to open the add-on

#### Step 3: Setup (Initiator Only)
1. The setup side panel opens for you (the initiator)
2. **Expected**:
   - See "Votació de l'Artista" title with playful styling
   - See option source selection (predefined or custom)
   - See dropdown for predefined lists: Mortensen (11 names), Dev (5 names), Disseny (5 names)
   - See preview of selected options with colorful styling
   - See "Començar votació" button
3. Choose poll options:
   - **Predefined list**: Select from dropdown
   - **Custom list**: Enter option names in textarea (one per line, minimum 2, maximum 50)
4. Click "Començar votació"
5. **Expected**:
   - Main stage appears for all participants
   - You're redirected to the activity side panel

#### Step 4: Vote
Each participant (including initiator):
1. Opens the add-on side panel
2. **Expected**: Voting interface with list of poll options (no registration needed)
3. Select one option (radio button with colorful styling)
4. Click "Enviar vot"
5. **Expected**:
   - Success message: "Vot enviat correctament!"
   - Shows which option you voted for
   - "Esperant la resta de vots..." message

**Host Only**: The initiator sees a "Revelar resultats" button

**Test**: Check main stage - should show "Esperant vots..." and update in real-time as votes come in

#### Step 5: View Results (Main Stage)
As votes come in:
1. **Expected**: Main stage updates in real-time
2. **Check**:
   - Vote counts update with playful number styling
   - Percentage bars animate with crayon colors
   - Progress bars show correctly
   - Vote totals are accurate

After all votes:
1. **Expected**:
   - Winner announced with crown emoji and confetti styling
   - Winner has yellow highlight with hand-drawn border
   - Or tie message if multiple participants tied

---

## Test Scenarios

### Scenario 1: Basic Flow with Mortensen List
1. Initiator joins Meet and starts add-on
2. Initiator selects predefined list "Mortensen" (11 names)
3. Initiator clicks "Començar votació"
4. Multiple participants join and vote
5. Each votes for their favorite option
**Expected**: Main stage shows vote counts for each option, winner announced

### Scenario 2: Dev Team List
1. Initiator selects "Dev" list (5 names: Adri, Edwin, Marie, Nika, Pau)
2. Start voting
3. 3 participants vote
**Expected**: Only 5 options shown, votes calculated correctly

### Scenario 3: Disseny Team List
1. Initiator selects "Disseny" list (5 names: Anita, Ana, Ester, Maria, Naomí)
2. Start voting
**Expected**: Only 5 design team options shown

### Scenario 4: Custom List
1. Initiator creates custom list with names:
   ```
   Opció A
   Opció B
   Opció C
   ```
2. Initiator clicks "Començar votació"
3. Participants vote for options
**Expected**: Main stage shows the 3 custom options with vote counts

### Scenario 5: Clear Winner
1. Initiator sets up poll with 5 options
2. 5 participants vote
3. 3 vote for "Adri"
4. 1 votes for "Edwin"
5. 1 votes for "Marie"
**Expected**: Adri wins with 60%, Edwin 20%, Marie 20%

### Scenario 6: Three-Way Tie
1. Poll with 3 options
2. 3 participants vote
3. Each option gets 1 vote
**Expected**: Tie message with all three options highlighted

### Scenario 7: No Votes
1. Initiator starts poll
2. Nobody votes yet
**Expected**: Main stage shows "Esperant vots..." with 0 votes

### Scenario 8: Validation Testing
1. Try custom list with only 1 option
**Expected**: Error "Cal introduir almenys 2 opcions"
2. Try custom list with 51 options
**Expected**: Error "Màxim 50 opcions permeses"
3. Try custom list with duplicate names
**Expected**: Error "Hi ha opcions duplicades"

---

## Common Issues & Solutions

### Issue: Button stays disabled in local testing
**Solution**: This is expected. Meet SDK requires actual Meet context. Test in Google Meet instead.

### Issue: "Side Panel is not yet initialized" error
**Solution**: Wait a moment for the SDK to initialize, or refresh the page.

### Issue: Main stage shows loading forever
**Solution**:
- Check browser console for errors
- Ensure starting state was passed correctly
- Verify Meet SDK is loaded

### Issue: Votes not appearing on main stage
**Solution**:
- Check browser console for Supabase connection errors
- Verify Supabase environment variables are set
- Check network tab for realtime websocket connections

### Issue: Dark mode looks broken
**Solution**: Ensure Tailwind dark mode classes are applied and system/browser dark mode is enabled.

### Issue: Host button not showing
**Solution**:
- Ensure you are the one who started the activity from the setup side panel
- Check sessionStorage for 'hostOfPollId' value
- The pollId must match the current poll's ID

---

## Visual Testing Checklist

**Landing Page**:
- [ ] Loads without errors
- [ ] Title in Catalan with playful font
- [ ] Confetti/colorful background
- [ ] Hand-drawn border effects
- [ ] Responsive on mobile/tablet
- [ ] Dark mode works

**Setup Side Panel**:
- [ ] Clean playful layout
- [ ] Radio buttons with crayon colors
- [ ] Dropdown styled correctly
- [ ] Textarea with hand-drawn border
- [ ] Preview section shows options
- [ ] Button with playful shadow
- [ ] Loading states work

**Activity Side Panel**:
- [ ] Poll question with playful styling
- [ ] Options list with cycling colors
- [ ] Radio buttons work
- [ ] Vote button disabled until selection
- [ ] Confirmation message after voting
- [ ] Host sees reveal button
- [ ] All text in Catalan

**Main Stage**:
- [ ] Confetti background
- [ ] Hand-drawn vote counter
- [ ] Results display with colorful bars
- [ ] Bars animate smoothly
- [ ] Winner highlighted with crown
- [ ] Tie detected and displayed
- [ ] Responsive layout
- [ ] Real-time updates work

## Functional Testing Checklist

**Poll Setup**:
- [ ] Can select predefined list (Mortensen, Dev, Disseny)
- [ ] Can create custom list
- [ ] Preview shows correct options
- [ ] Validation prevents < 2 options
- [ ] Validation prevents > 50 options
- [ ] Validation detects duplicates
- [ ] Both modes work correctly

**Voting**:
- [ ] Can select any option
- [ ] Can submit vote
- [ ] Vote appears immediately on confirmation
- [ ] No registration required
- [ ] Confirmation appears after voting
- [ ] Anonymous voting works

**Results**:
- [ ] Vote counts accurate
- [ ] Percentages calculate correctly
- [ ] Bars show proportionally with colors
- [ ] Winner identified correctly
- [ ] Tie detected correctly
- [ ] Real-time updates happen

**Host Features**:
- [ ] Only host sees reveal button
- [ ] Host can reveal results
- [ ] Non-hosts cannot reveal

**Edge Cases**:
- [ ] 2 options (minimum) works
- [ ] 50 options (maximum) works
- [ ] Long option names display correctly
- [ ] All vote for same option
- [ ] Nobody votes (0 votes displayed)
- [ ] Special characters in custom options

---

## Device Testing

Test on multiple devices:
- [ ] Desktop Chrome
- [ ] Desktop Firefox
- [ ] Desktop Safari
- [ ] Mobile Safari (iOS)
- [ ] Mobile Chrome (Android)
- [ ] Tablet

---

## Debugging Tips

### Enable Console Logging
Check browser console for:
- Initialization messages
- Supabase connection status
- Error messages
- State updates

### Network Tab
- Check for Supabase WebSocket connections
- Verify realtime channel subscription
- Look for failed requests

### React DevTools
- Inspect component state
- Check prop values
- Verify re-renders

### Common Console Errors to Watch For
```
"Side Panel is not yet initialized!"
→ Wait for initialization or check Meet context

"Error parsing poll state"
→ Check JSON format in additionalData

"Supabase connection failed"
→ Check environment variables and network
```

---

## Test Sign-Off

Once all tests pass:
- [ ] All pages load correctly with playful theme
- [ ] All components display properly
- [ ] Voting works without registration
- [ ] Results calculate correctly
- [ ] Real-time updates work via Supabase
- [ ] All text in Catalan
- [ ] Playful styling consistent throughout
- [ ] Responsive design works
- [ ] Dark mode works
- [ ] No console errors
- [ ] Works in actual Google Meet call
- [ ] Host detection works correctly

---

## Next Steps After Testing

1. **Fix any bugs found**
2. **Test with larger groups** (10+ participants)
3. **Performance testing** with many votes
4. **Implement tiebreaker** (if needed)
5. **Deploy to production** GitHub Pages
6. **User acceptance testing** with real users
7. **Gather feedback** and iterate

---

For questions or issues, check:
- `CLAUDE.md` - Full project context
- `IMPLEMENTATION_STATUS.md` - Current implementation status
