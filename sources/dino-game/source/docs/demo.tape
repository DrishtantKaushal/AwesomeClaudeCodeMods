# vhs docs/demo.tape — records /dino demo into docs/raw.mp4; then crop it to the board:
#   ffmpeg -i docs/raw.mp4 -vf "crop=1080:380:0:112" -c:v libx264 -pix_fmt yuv420p -crf 23 -movflags +faststart docs/demo.mp4
#   ffmpeg -i docs/raw.mp4 -vf "crop=1080:380:0:112,fps=15,scale=900:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=32[p];[b][p]paletteuse=dither=none" docs/demo.gif
Output docs/raw.mp4

Set Shell zsh
Set FontSize 16
Set Width 1280
Set Height 720
Set Padding 16
Set Theme "Catppuccin Mocha"
Set TypingSpeed 60ms

Hide
# a clean session: nothing inherited from a Claude Code session the recording is started from
Type "unset CLAUDECODE CLAUDE_PID CLAUDE_EFFORT CLAUDE_PLUGIN_DATA CLAUDE_CODE_ENTRYPOINT CLAUDE_CODE_EXECPATH CLAUDE_CODE_SESSION_ID CLAUDE_CODE_CHILD_SESSION CLAUDE_CODE_SESSION_ATTENDED CLAUDE_CODE_BRIDGE_SESSION_ID CLAUDE_CODE_MESSAGING_SOCKET CLAUDE_CODE_MESSAGING_TOKEN"
Enter
# started from a folder Claude Code already trusts, with the plugin loaded from this checkout
Type "export CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 && cd ../cc-mods && clear && claude --plugin-dir ../cc-dino --setting-sources project,local"
Enter
Sleep 10s
Show

Sleep 1s
Type "/dino demo"
Sleep 400ms
Enter
# the run lasts about 27 s; hold on the crash and the leaderboard beside it
Sleep 31s
