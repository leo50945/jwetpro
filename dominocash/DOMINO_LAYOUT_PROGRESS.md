# Domino Layout Progress

## Step 1 - Initial inspection

- `DOMINO_LAYOUT_PROGRESS.md` did not exist, so this file was created before changing the layout.
- Current board rendering is in `index.html`.
- `renderBoard()` creates `.board-tile` elements from `gameState.boardTiles`.
- `layoutBoardTiles()` chooses a tile size and calls `placeBoardSnake()`.
- `calculateBoardSnakeLayout()` currently uses implicit state (`cursorX`, `rowTop`, `downX`, `downY`, `direction`) instead of an explicit open-end path model.
- The next change should make each placed tile carry explicit orientation, entry direction, exit direction, turn state, and bounds.

## Rules to preserve

- Do not change domino game rules, played tile order, draw logic, turns, bot logic, or scoring.
- Keep automatic scale simulation.
- Keep the board responsive by reading actual board dimensions.
- Keep connected domino gap tiny; no grid spacing.
- Avoid ambiguous orientation CSS such as forcing every double into one global direction without context.

## Step 2 - Explicit visual path model

- Replaced the implicit board path state with an explicit visual path model in `calculateBoardSnakeLayout()`.
- Each placed tile now records `x`, `y`, `orientation`, `isDouble`, `isTurn`, `entryDirection`, and `exitDirection`.
- The active path state now uses `currentDirection`, `openEnd`, `previousHorizontalDirection`, and `visualPath`.
- Normal tiles follow the path direction: horizontal on horizontal runs, vertical while descending.
- Doubles are perpendicular to the current path direction: vertical on horizontal runs, horizontal on vertical descents.
- CSS orientation is now explicit with `tile-horizontal`, `tile-vertical`, `double-horizontal`, `double-vertical`, and `turn-tile`.

## Step 3 - Scale and validation

- `getBoardTileWidth()` still simulates full layouts from the preferred size down to the minimum size.
- Minimum board tile width was lowered from `36px` to `28px` so compact boards have more room before a layout becomes invalid.
- The overlap safety loop in `layoutBoardTiles()` now uses the same `28px` minimum.
- Syntax was checked by extracting the inline script and running `node --check`.
- Geometry simulation was run for 1, 5, 10, 20, 28, 30, and 50 tiles across compact and large board sizes.

## Current limitations to watch

- Very compact board heights can still be too small for long chains when doubles must stay perpendicular to the path and lanes must stay visually natural.
- Avoid solving that by returning to row/column grids or by adding large connected gaps. Prefer scale reduction, a larger playable board area, or a controlled scroll/zoom treatment if needed later.
- Keep turn logic based on `openEnd`; do not reconnect new rows from a tile midpoint.

## Step 4 - Prevent unreadably small tiles

- The previous `28px` minimum made tiles too small and visually messy on compact boards.
- Added `BOARD_MIN_TILE_WIDTH = 42` as the readable minimum.
- `layoutBoardTiles()` now first tries to fit inside the visible board.
- If the layout still does not fit at the readable minimum, it expands the internal `.board` surface to the simulated path size instead of shrinking further.
- `.board-scroll` now allows scrolling, so compact screens can keep readable dominoes without returning to a grid or large connected gaps.
- This preserves the explicit `openEnd` path model and avoids solving tight layouts by making dominoes overlap or become tiny.
- Syntax was checked again by extracting the inline script and running `node --check`.

## Step 5 - Real downward serpent curve

- The previous descent turned back horizontally as soon as `laneSpacingY` was reached.
- That made the curve too short and could still look like compact lanes instead of a classic domino path.
- Descent now continues while the next domino can still be placed downward inside the current board bounds.
- The path turns back left/right only when the next downward domino would exceed the bottom of the board.
- `layoutBoardTiles()` can now expand the internal board repeatedly, up to `BOARD_MAX_SCROLL_EXPANSION`, so the longer descent has room before scale is reduced or the layout is accepted.
- This keeps connected gap unchanged and preserves the `openEnd` path model.

## Step 6 - Readable size before fit

- User feedback: tiles still became too small and visually tangled when screen space was tight.
- New rule: do not shrink the board tiles just to make the whole chain fit on screen.
- `BOARD_MIN_TILE_WIDTH` was raised to `64px`.
- `getBoardTileWidth()` now chooses a readable tile size based on whether one tile can fit in the visible board, not whether the entire visual path fits.
- `layoutBoardTiles()` calculates the serpent using the visible board size so horizontal saturation still forces a vertical turn.
- If the full path does not fit, the internal `.board` surface expands to the already-calculated path size and the scroll container handles overflow.
- This replaces the previous repeated expansion approach; avoid reintroducing full-path-fit scaling because it causes tiny, messy dominoes.
- Syntax was checked again by extracting the inline script and running `node --check`.

## Step 7 - Treat predicted overlap as saturation

- User feedback: dominoes could still appear stacked when the screen was tight.
- Added `placementOverlapsItems()` to test a proposed placement against already placed board dominoes.
- If a horizontal placement would overlap an existing domino, the layout treats that like a saturated line and changes direction downward.
- This keeps the visual rule simple: never solve tight space by placing a domino on top of another domino.

## Step 8 - Centered virtual board and vertical direction choice

- The source requirement asks for a virtual board centered at `0,0` and a global board scale instead of per-tile shrinking.
- `computeDominoLayout()` now places the first domino at virtual center `(0,0)`.
- The layout computes a bounding box and a shared `scale` for all board dominoes.
- Board dominoes are positioned around the visual center of the board using transform-based placement.
- Horizontal scroll/board expansion was removed from the active layout path.
- When a horizontal line is saturated, the engine chooses a vertical turn direction: it goes down if there is space, otherwise up.
- A vertical run continues in its chosen direction until the next vertical domino would hit the board bound, then it returns horizontally in the opposite direction.
- This prevents endless downward growth that previously forced extreme scale values.
- Syntax was checked again by extracting the inline script and running `node --check`.
- Geometry simulation covered 5, 10, 20, and 28 dominoes on 320px, 375px, 430px, tablet, and desktop-sized boards.
- The simulation showed alternating right/down/left/up serpent movement and kept scale near readable values on mobile instead of collapsing to tiny dominoes.

## Step 9 - Resize and cleanup

- Added `ResizeObserver` on the board and its viewport parent so layout recalculates when the board area changes, not only on `window.resize`.
- Kept `window.resize` as a fallback and to continue adjusting hand layouts.
- Removed old board fit helpers (`boardHasOverlaps()` and `getBoardTileWidth()`) after the centered global-scale engine replaced per-tile fit scaling.
- Added explicit `overflow: hidden` and `touch-action: manipulation` to `.board`.

## Step 10 - Stable transform placement

- Board tile position is now split between `left/top` and `transform`.
- `left/top` receive the scaled virtual coordinate offset from the board center.
- `transform` now only does `translate(-50%, -50%) scale(...)`.
- This avoids mixing percentage centering with pixel offsets in one transform expression and keeps centering more predictable.

## Step 11 - Responsive serpent planning and real corner turns

- User feedback: when the screen was tight, the layout still preferred shrinking and could visually stack pieces instead of making a natural serpent.
- `computeDominoLayout()` now evaluates several virtual planning scales and chooses the best candidate that has no overlap and keeps the global scale readable.
- The board bounds used for planning are expanded according to the tested planning scale, so the path can use the space it will have after global scaling instead of turning too early.
- Vertical turn choice now checks overlap first. If a downward turn is clear, it keeps the curve moving down instead of bouncing up/down in the same column.
- Corner placement was corrected: when the path changes from horizontal to vertical, or vertical to horizontal, the new domino is placed in the free quadrant after the open end. This prevents the turn tile from being centered on top of the previous domino.
- `.board-scroll` padding is now responsive with `clamp()`, giving the board more usable height on small screens while still leaving room for the message and player hand overlays.
- Geometry simulation was rerun for compact mobile and larger boards with 10, 20, 28, and 40 dominoes. The checked layouts no longer overlapped; realistic mobile board heights kept the 28-domino layout above the readable scale threshold.
- Important rule for future edits: do not fix tight boards by shrinking tiles first. Let the path plan with a larger virtual space, turn cleanly at open ends, and only then apply one global scale.

## Step 12 - Runtime browser verification

- Added lightweight CDN fallbacks for `gsap`, `ScrollTrigger`, and `lucide` so the game and layout diagnostics still run when external scripts are unavailable in a local/offline test session.
- Added a local-only URL test mode: `?layoutTest=28` works only on `localhost` or `127.0.0.1`. It renders a fixed number of board dominoes without changing normal gameplay.
- Verified the actual rendered DOM in the browser, not only the layout math.
- Runtime checks covered 28 dominoes at 320px, 375px, 430px, tablet, and desktop widths. Results: no tile overlaps, no tile outside the board, no horizontal page scroll, and doubles stayed vertical.
- Runtime check with one domino at 320px confirmed the tile center matches the board center, and a first double renders as `double-vertical`.
- Stress checks with 40 and 60 dominoes also had no overlaps and no board overflow. On extremely small screens with 60 dominoes the global scale becomes very small, but the layout remains clean instead of stacking tiles.
- Captured the 320px/28-domino case visually; it shows a continuous serpent with horizontal runs, vertical turns, and no compact grid.

## Step 13 - Half-tile turn connection

- User feedback: the previous non-overlap fix was still visually wrong.
- Root cause: corner tiles were placed in the free quadrant after the open end. That prevented overlap, but it could make the turn look offset instead of physically connected.
- `placeTileFromOpenEnd()` now treats turns as half-domino connections:
  - horizontal-to-vertical turns align the near half of the vertical domino with the open half of the horizontal domino;
  - vertical-to-horizontal turns align the near half of the horizontal domino with the open half of the vertical domino.
- This keeps the connected gap tiny while making the bend read as a real domino chain instead of separate rows.
- Syntax check passed after the change.
- Geometry simulation covered 10, 20, 28, and 40 dominoes across compact mobile, standard mobile, tablet, and desktop board sizes. Results: no overlaps, readable scale, and serpent directions still alternate naturally.
- Browser runtime check at 320x640 with 28 dominoes: 28 rendered tiles, 0 overlaps, 0 outside board, no horizontal scroll, 4 vertical doubles, and 10 vertical board tiles in the serpent.

## Step 14 - Direction-aware value order

- User feedback: the third turn at the bottom still looked wrong.
- Root cause: the tile geometry was connected, but the visual halves stayed in original DOM order. When the serpent moved left or up, the connected half could appear on the wrong side of the domino.
- Added `orientBoardTileValues()` in `placeBoardSnake()`.
- Board tiles now keep their game values in `data-a` and `data-b`, and each rendered half stores `data-value`.
- If a board tile exits left or up, its displayed halves are reversed so the visually connected value is on the entry side of the path.
- This changes only board rendering. It does not change `gameState.boardTiles`, matching rules, left/right play logic, scores, or hand tiles.
- Browser check at 320x640 with 28 dominoes after the change: 28 tiles, 0 overlaps, 0 outside board, no horizontal scroll. Several left/up path tiles were correctly reversed visually.

## Step 15 - Doubles perpendicular on vertical path

- User feedback: a double in the lower vertical section rendered vertically, matching the normal column tiles. It should have been horizontal.
- Updated `getBoardTileOrientation()` so doubles are perpendicular to the path direction again: vertical on horizontal runs, horizontal on vertical runs.
- Added `getBoardDoubleOrientation(previousDirection, pathDirection)` for turn cases. If a double touches a vertical direction in entry or exit, it renders horizontal.
- This specifically fixes doubles placed at the bottom of a descending column before the serpent turns.
- Local test mode now accepts `doubleEvery`, for example `?layoutTest=24&doubleEvery=9`, to force doubles into different path positions during visual checks.
- Syntax check passed. Simulation with forced doubles at several cadences reported 0 overlaps.
- Browser check with `layoutTest=24&doubleEvery=9`: one `double-horizontal` was rendered for the vertical/turn case, with 0 overlaps and 0 outside board.

## Step 16 - Final rendered-rect bounds validation

- User feedback: a real board state could stick to the top/left edge and visually cut off dominos.
- Root cause: after centering, `item.x` and `item.y` represent render centers, but some overlap and validation helpers still treated them like top-left rectangle coordinates.
- Added `rectX` and `rectY` to keep the original placement rectangle separate from the rendered center position.
- Added `rectFromItem()` for placement-space overlap checks and `centeredRectFromItem()` for final render-space bounds checks.
- `placementOverlapsItems()` and final pairwise overlap checks now use placement rectangles instead of accidentally mixing center coordinates with top-left coordinates.
- `calculateDominoLayoutCandidate()` now computes a final overflow score from centered rendered rectangles after scale/recentering, so candidates that would clip at the top/left are rejected or ranked lower.
- Browser check near the reported screenshot size (`592x516`, `layoutTest=28&doubleEvery=9`): 28 tiles, 0 overlaps, 0 outside board, no horizontal scroll, rendered tile bounds stayed inside the board.

## Step 17 - Horizontal six pip orientation

- User feedback: on a horizontal `6/4` domino, the `6` half looked upright. The double 6 was correct, but the single `6` on the horizontal tile needed to be laid down.
- Added CSS rules for `.board-tile.tile-horizontal .half[data-value="6"]` and `.board-tile.double-horizontal .half[data-value="6"]`.
- On horizontal board tiles, the six pips now render as two horizontal rows of three points instead of two vertical columns of three.
- Vertical tiles and vertical doubles keep the original upright six layout.
- Added a local-only `layoutTiles` test parameter, for example `?layoutTiles=6-6,6-4`, to reproduce exact short board states without changing gameplay.
- Browser check with `layoutTiles=6-6,6-4`: the double 6 stayed vertical/upright, while the `6` half on the horizontal `6/4` used grid areas `1/1, 1/2, 1/3, 3/1, 3/2, 3/3`.

## Step 18 - Explicit pip orientation class

- User feedback: fix the `6` rendering properly, not with a fragile selector.
- Replaced parent-dependent horizontal-six CSS with an explicit `.pips-horizontal` class on the rendered half.
- `orientBoardTileValues()` now rebuilds board halves with `createHalf(value, { pipsOrientation })` after the tile receives its layout class.
- Added `getBoardPipOrientation(item, value)`: only value `6` on horizontal board tiles receives horizontal pips; vertical doubles and vertical tiles keep upright pips.
- This avoids stale classes after a tile is reversed for left/up path direction.
- Browser check with `layoutTiles=6-6,6-4`: `6-6` halves stayed `half`, while the `6` half on `6-4` became `half pips-horizontal` and used horizontal row grid areas.
- Browser check with `layoutTest=28&doubleEvery=9`: 28 tiles, 0 overlaps, 0 outside board, no horizontal scroll, and 6 horizontal six halves detected.

## Step 19 - Double open-end routing

- User feedback: after a double, the next domino could attach to the side/edge in a way that looked wrong. The next tile should either continue horizontally from the middle of the double, or leave from the top/bottom when the path turns.
- Root cause: a double reused the same `openEnd` model as normal dominos. That was enough for collision math but not enough for natural double routing.
- `adjustDoubleExit()` now preserves the normal side-center exit for continuing straight, and adds double metadata (`fromDouble`, `centerX`, `centerY`, `left`, `top`, `right`, `bottom`).
- `placeTileFromOpenEnd()` now detects when the previous open end came from a double:
  - horizontal continuation still starts from the middle of the double side;
  - horizontal-to-vertical turns after a double start from the bottom or top center of the double;
  - vertical-to-horizontal turns after a double start from the left or right center of the double.
- Simulation for `6-4,4-4,4-5,5-5` showed the `4-5` continuing horizontally from the double's center line with 0 overlaps.
- Narrow-board simulation forced a turn after the double and showed the next vertical tile leaving from the double's bottom center with 0 overlaps.
- Browser check near the reported visual size with `layoutTiles=6-4,4-4,4-5,5-5`: 0 overlaps, 0 outside board; the tile after the double continued horizontally from the double midpoint.

## Step 20 - Mobile hand readability and ad removal

- User feedback: on mobile, hand tiles stacked visually and became hard to read; the footer area labeled `Espas piblisite` also consumed useful screen height.
- Root cause: `fitHand()` tried to force every hand tile into the available width by shrinking and adding negative overlap. On narrow screens this made the hand look like a compressed pile instead of a playable row.
- Removed the ad footer from the HTML and deleted the `.ad-banner` CSS block.
- Changed hand containers to be mobile-first horizontal scrollers with hidden scrollbars and no negative margin between dominos.
- Simplified `fitHand()` so it keeps a readable tile width (`44px` minimum for the player hand) and sets `--hand-overlap` to `0px`.
- Future rule: never solve a crowded mobile hand by overlapping dominos. Keep the tiles readable and let the hand scroll horizontally.

## Step 21 - Visual scan cleanup

- Ran a visual layout scan after the mobile hand fix.
- Found that `.avatar` had contradictory CSS (`display: none` and `display: grid` in the same rule), so avatars were still visible on mobile and reduced useful hand width.
- Found that the player tile counter inherited both `left` and `right`, stretching it across the whole hand and making it touch the dominos.
- Found that the message bar could collide with the bot hand, and the draw pile could collide with the message on very short mobile screens.
- Fixed mobile spacing by hiding avatars below `700px`, giving the player counter `right: auto`, moving it higher above the hand, shortening the mobile message bar to leave space for the draw pile, and increasing the top board padding.
- Moved the bot hand closer to the safe top edge so it does not collide with the message on desktop.
- Browser scans passed at `371x258` and `1280x720`: 0 hand tile overlaps, no ad footer, no page horizontal overflow, no hand clipping, and no collisions between the message, bot hand, draw pile, player counter, avatar, and player hand.

## Step 22 - Prevent inward/upward serpent turns

- User feedback: in long board states, the serpent could descend, move left/right, then turn upward and re-enter its own interior. This looked like a compact block and could create visual impasses even when the dominos did not technically overlap.
- Root cause: `chooseVerticalTurnDirection()` still allowed an `up` turn whenever the downward turn did not fit cleanly. That made the path optimize for local bounds instead of preserving a natural one-way serpent.
- Changed `chooseVerticalTurnDirection()` so every vertical lane change goes `down`. The chain can still alternate horizontally left/right after a descent, but it no longer climbs back into already-used rows.
- This does not change game rules, matching, scoring, draw logic, or the connected gap. It only changes the visual path direction decision.
- Browser checks at the reported board shape with `layoutTest=28`, `layoutTest=40`, and `layoutTest=60` plus forced doubles showed 0 overlaps, 0 outside-board dominos, and no visible upward path moves.
- Future rule: do not reintroduce upward fallback as a quick fix for bounds. If a long chain needs space, solve it with global scale or board planning, not by letting the serpent return into its own interior.

## Step 23 - Always-visible profile bubble

- User feedback: the bot profile icon should be visible on every device and should sit inside a real bubble like the player avatar, not disappear on mobile.
- Root cause: avatars were previously hidden below `700px`, and `.opponent-area > div` also matched the avatar `div`, overriding the avatar's fixed flex sizing.
- Made `.avatar` visible by default, with a `42px` mobile bubble and a `48px` desktop bubble.
- Changed the opponent hand container selector to `.opponent-area > div:not(.avatar)` so it no longer changes the bot profile bubble sizing.
- Browser check at `371x258`: bot profile bubble rendered as `42x42`, did not touch the bot hand, bot backs stayed visible, and there was no horizontal page overflow.

## Step 24 - One-by-one draw modal

- User feedback: drawing from the pile could pull several dominos at once. The player should draw exactly one domino at a time, and should choose a specific domino from a draw modal.
- Root cause: `drawTile()` used a `do...while` loop that kept drawing until a playable domino was found. `botTurn()` had the same issue with a `while` loop.
- Replaced human drawing with `openDrawModal()` and `chooseDrawTile(index)`. The draw button now opens a modal showing each pile domino as a back-facing domino choice.
- When the player clicks one draw choice, the modal closes first, then that exact pile index is removed and one domino is added to the player's hand.
- Updated bot drawing so it draws one domino, renders/animates it, then reevaluates after a short delay instead of consuming many dominos in one synchronous loop.
- Added a local-only `?drawTest=1` state for browser verification.
- Browser check with `?drawTest=1`: draw modal opened with 3 hidden choices, 0 face-up choices, selecting one closed the modal, changed the player hand from 1 to 2 dominos, and changed the pile from 3 to 2 dominos.

## Step 25 - Human-like bot timing

- User feedback: the bot drew and played too quickly. It should feel more human, with a random thinking time between 3 and 5 seconds.
- Added `BOT_MIN_THINK_MS = 3000`, `BOT_MAX_THINK_MS = 5000`, and `getBotThinkingDelay()`.
- `scheduleBotTurn()` now waits a random 3-5 seconds before the bot starts acting.
- After a bot draw, the next bot reevaluation also waits a random 3-5 seconds.
- When the bot has a playable domino, the actual play action waits a random 3-5 seconds before calling `playTile(tile, side)`.
- Syntax check passed after replacing the old fast `760ms`, `620ms`, and `360ms` bot delays.

## Step 26 - Faster bot pacing

- User feedback: the 3-5 second bot delay felt too slow during normal play.
- Reduced normal bot thinking/play delay to a random `1200ms`-`2200ms`.
- Added a shorter draw reevaluation delay of `800ms`-`1400ms` so repeated bot draws still feel responsive.
- `getBotThinkingDelay(context)` now accepts `"draw"` to use the shorter range after a bot draw.
- Syntax check passed after the timing adjustment.

## Step 27 - Delay result modal until played tile settles

- User feedback: when someone wins, loses, or the game blocks, the final modal appeared before the last played domino animation finished.
- Root cause: `playTile()` called `checkWinner()` and `checkBlocked()` immediately after `animatePlayedTile()`, so `endRound()` could open the result modal while the tile was still visually arriving on the board.
- Added `PLAYED_TILE_SETTLE_MS = 650`.
- `playTile()` now waits for that settle delay before checking winner/block state and before changing turns.
- This keeps the final board readable: the last domino appears first, then the win/loss/blocked modal appears.
- Syntax check passed after the timing change.

## Step 28 - Remove hand count labels

- User feedback: remove the text labels showing how many dominos the player and opponent have.
- Removed the `botCount` and `youCount` badge elements from the hand zones.
- Removed their `els` references and `renderHud()` text updates.
- Removed the now-unused `.tile-count` CSS rules.
- Kept the draw pile counter visible because it belongs to the pile, not to either hand.
- Syntax check passed after cleanup.

## Step 29 - Opening shuffle and deal animation

- User feedback: before players start playing, the game should show a domino shuffle animation for 3 seconds, then a distribution animation.
- Added an `introLayer` inside the board with an `introStack` that temporarily renders all 28 dominos as backs.
- `initGame()` now starts normal rounds in a busy state with empty hands while the intro plays, so the player cannot act before distribution finishes.
- `runOpeningAnimation(deck)` shuffles the back-facing dominos visually for 3 seconds.
- `animateOpeningDeal(deck, cards)` then sends the cards toward the player hand, bot hand, and draw pile before calling `finishOpeningDeal(deck)`.
- `finishOpeningDeal(deck)` performs the real deal, chooses the starting player, renders the hands, and schedules the bot if needed.
- Local test modes (`layoutTest`, `layoutTiles`, `drawTest`) bypass the intro so verification remains fast and deterministic.
- Browser check: during intro there were 28 back-facing intro dominos and 0 hand dominos; after the sequence, the intro layer was hidden, both hands had 7 dominos, and the pile had 14.

## Step 30 - Transparent inactive draw pile

- User feedback: the draw pile should stay in front but become slightly transparent when inactive so it does not fully hide board dominos behind it.
- Added inactive opacity on `.draw-pile` (`0.48`) with a short transition.
- The pile returns to full opacity when it is enabled, marked `must-draw`, hovered, or keyboard-focused.
- Lowered the inactive pile badge background opacity, while keeping it fully readable during active/hover/focus states.
- This is visual only; click behavior and pile count logic are unchanged.
- Syntax check passed after the CSS change.

## Step 31 - Separate weak and strong bot engines

- User feedback: create two different bot levels: the current weak bot and a new strong bot that controls the match naturally and should always end as winner by emptying its hand or closing the game.
- Added bot level constants: `BOT_LEVEL_WEAK`, `BOT_LEVEL_STRONG`, and `DEFAULT_BOT_LEVEL`.
- `botTurn()` is now a router. The old behavior moved into `weakBotTurn()`, while the new rigged behavior lives in `strongBotTurn()`.
- Strong mode is configurable with `?bot=strong` or `?bot=weak`; default is currently strong so the new engine is active unless explicitly disabled.
- Added `buildStrongBotRound()` to control the initial distribution. It creates varied scenarios such as `bot-run`, `bot-run-alt`, `human-start-trap`, and `human-start-trap-alt`.
- Added `chooseStrongBotMove()` with scoring that prefers emptying the bot hand, blocking the player, keeping future bot plays alive, and lowering bot points for possible closure.
- Added `drawStrongBotTile()` so the bot draws a useful tile when it needs one.
- Added `chooseStrongHumanDrawIndex()` so the human draw modal can still show hidden choices while strong mode can choose the actual drawn domino that best preserves the bot plan.
- Added `?intro=0` as a verification-only shortcut to skip the opening animation while preserving normal gameplay state.
- Browser checks confirmed strong distributions vary, weak distributions remain random, and in a human-start strong scenario the bot responded to `6-6`, reduced its hand, and forced the human into draw state.

## Step 32 - Bot level selection before the round starts

- User feedback: before the game starts, show a modal so the player can choose the bot level.
- Added `botLevelModal` with two explicit choices: weak bot and strong bot.
- The normal startup now opens this modal first and does not call `initGame()` until the player chooses a level, so no shuffle, deal, hand render, or bot action starts too early.
- The selected level is saved in `localStorage` as `dominoBotLevel`, then `initGame()` reads it through the existing `getConfiguredBotLevel()` path.
- Replay now reopens the bot level modal, unless the level is fixed by URL parameters.
- Kept test and deep-link bypasses: `?bot=weak`, `?bot=strong`, `layoutTest`, `layoutTiles`, and `drawTest` start directly so automated checks stay deterministic.
- Syntax check passed. Browser check with local CDN stubs confirmed: modal opens with 2 choices, hands stay empty before selection, choosing weak closes the modal and stores `weak`, and `?bot=strong&intro=0` bypasses the modal.

## Step 33 - Natural strong-bot player hand

- User feedback: in strong mode, the player hand looked obviously rigged because good values, especially 6 ends, were too rare.
- Root cause: `buildStrongBotRound()` used scenario hands such as `bot-run` and `human-start-trap`, and `takeSafeHuman()` intentionally avoided values 3, 4, 5, and 6 for the player.
- Replaced those fixed scenarios with a natural player deal: the player now receives the first 7 dominos from a real shuffled deck, without filtering out 6s, doubles, or strong starts.
- The strong bot still gets a discreet advantage by drafting part of its own hand from the remaining pool using flexible/high-value scoring, then filling the rest randomly.
- The draw pile is now ordered with a light bot-favoring score instead of hiding all 6-value dominos from the player.
- Softened `chooseStrongHumanDrawIndex()` so the player's clicked draw choice is often respected; strong mode only nudges the draw when it can do so without feeling constant.
- Syntax check passed. Browser sampling over 40 strong-mode rounds showed 40 unique player hands, 38 hands with at least one 6-value domino, and 10 hands with `6-6`, which is much closer to a natural distribution.

## Step 34 - Hidden strong-bot hand/pile exchange

- User feedback: the strong bot could still lose because its seven dealt dominos were treated as a fixed hand. The requested behavior is for those hidden backs to act as a facade while the strong bot can discreetly exchange one hand domino with one draw-pile domino.
- Root cause: `strongBotTurn()` only evaluated `gameState.players[BOT]`. `drawStrongBotTile()` could select a useful pile domino only after the bot had no playable move, which made the intervention visible as a normal draw.
- Added `prepareStrongBotHandForTurn()` before strong-bot move selection. It simulates every legal one-for-one hand/pile exchange, evaluates the resulting move, and applies the strongest exchange only when it materially improves the bot's position.
- The exchange is internal: bot hand size and pile size remain unchanged, the opponent still sees the same number of backs, and no draw message, sound, or animation reveals the swap.
- Added `strongSwapUsedThisTurn` so the strong bot can perform at most one hidden exchange during a turn, including turns where its logic is reevaluated after a visible draw.
- Added emergency endgame weighting: when the player has one or two dominos left, moves that leave the player with no playable response receive decisive priority. This lets the bot use an exchange to send the player toward the pile or protect against an immediate human finish.
- The weak bot remains unchanged and never uses hidden exchanges.
- JavaScript syntax check passed. A deterministic engine test started with no `6` in the bot hand, `6-6` open on the board, and `4-6` in the pile: the bot exchanged `1-5` for `4-6`, preserved both hand and pile counts, and rejected a second hidden exchange during the same turn.

## Step 35 - Fairer strong-bot pressure and draw protection

- User feedback: the player was forced to draw too many dominos and was blocked from the beginning of almost every strong-bot game, making the result feel repetitive and frustrating.
- Root cause: `chooseStrongHumanDrawIndex()` replaced a playable selected domino with a non-playable one roughly 45% of the time. Strong-bot blocking also received a large bonus from the first moves, while hidden exchanges had no opening phase or cooldown.
- A selected playable draw is now always respected. When the selected domino cannot play, strong mode may instead assist with a playable pile domino; assistance is guaranteed during the opening and by the player's third consecutive draw.
- The initial draw pile is now genuinely shuffled. It is no longer pre-sorted against the player's values.
- Added three per-round strong-bot styles: `balanced` (50%), `adaptive` (35%), and `pressure` (15%). They vary hidden-exchange frequency, blocking strength, and player draw assistance while keeping the same strategic engine.
- Hidden exchanges are disabled for the first six board dominos, normally require at least four new board placements since the previous exchange, and happen only according to the selected style. Emergency defense remains available when the player has one or two dominos.
- Early-game moves that immediately leave the player without a legal response now receive a penalty instead of a blocking bonus.
- Syntax and deterministic behavior checks passed: a playable selected draw stayed selected, an opening draw and a third consecutive draw both received an available playable domino, and an opening hidden-swap attempt left the bot hand unchanged.

## Step 36 - Public-memory consistency for the strong bot

- User feedback: when the bot draws or passes with open ends such as `2` and `6`, the player logically remembers that the bot had neither value. A later hidden exchange must not let the bot suddenly play a `2` or `6` without a visible event that makes this possible.
- Added `botPublicMissingValues`, a round-level memory of values the bot has publicly demonstrated are absent from its hidden hand.
- Before every visible bot draw or pass, the two current open-end values are recorded as publicly missing.
- A visible bot draw clears only the values actually present on that drawn domino. This makes those values credible again because the player saw the bot acquire an unknown tile from the pile.
- Hidden exchanges now reject every incoming pile domino containing a publicly missing value.
- Most importantly, `strongBotTurn()` now checks the unmodified bot hand first. A hidden exchange is considered only when that hand already contains a legal move. If the bot is genuinely blocked, it must draw visibly and cannot secretly manufacture a playable move to avoid the draw.
- Added a second guard inside `prepareStrongBotHandForTurn()` so future call sites also cannot perform a hidden rescue while the real hand is blocked.
- Syntax and deterministic memory checks passed for the exact `2/6` scenario: both values were remembered, a hidden rescue was refused, a visible `0-2` draw made only `2` credible again, and an unseen `6` remained forbidden.

## Step 37 - Thirty-second human turn timer

- User request: the human player must lose if 30 seconds pass during their turn without playing.
- Added a responsive timer pill to the top-right of the board. It is visible only during the human turn and changes to a red danger state for the final 10 seconds.
- The timer starts when a human turn becomes active, including the first turn after dealing, and stops immediately when the player commits a valid domino.
- Opening the draw modal or drawing an unusable domino does not reset the deadline; the same 30-second turn continues until the player makes a valid play or the normal automatic pass occurs.
- At zero, the round ends immediately with the bot as winner. The bot receives the points remaining in the player's hand and all open play/draw modals close.
- Timer intervals are cleared on turn changes, round initialization, and every round-ending path to prevent stale countdowns.
- Syntax and deterministic timer checks passed: `30s` at start, danger state at `10s`, bot victory and hand-point award at zero, timer hidden, and interval cleared after the loss.

## Step 38 - Professional bot-level selector

- Reworked the opening bot-level modal into a compact JWETPRO-aligned surface with restrained green, navy, and gold styling.
- Removed the automatic blue emphasis from strong mode so both choices have equal visual weight before selection.
- Replaced mixed French/Kreyòl labels with consistent Kreyòl options: `Nòmal` and `Avanse`.
- Reduced corner radii, shadows, card height, and icon weight; added clear hover and keyboard-focus states plus responsive mobile sizing.
- Bot behavior and the existing `weak` / `strong` engine values remain unchanged.
