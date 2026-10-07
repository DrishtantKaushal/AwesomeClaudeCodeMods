#!/bin/bash
# 錄指定的 tape，裁掉 Claude Code 最底下的狀態列，再蓋掉帳號用量警告
# 用法：./record.sh plan-bar leftovers（NOCROP=1 只錄不裁，CROPONLY=1 只裁不錄）
set -e
cd "$(dirname "$0")"
export CLAUDE_CONFIG_DIR="$HOME/.claude-demo"
KEEP=752
PAD=24
BG=0x282828
for name in "$@"; do
  [ -z "$CROPONLY" ] && vhs "$name.tape"
  [ -n "$NOCROP" ] && continue
  for file in ../"$name".gif ../"$name".png; do
    [ -f "$file" ] || continue
    tmp="${file%.*}.tmp.${file##*.}"
    if [ "${file##*.}" = gif ]; then
      ffmpeg -loglevel error -y -i "$file" -filter_complex \
        "crop=iw:$KEEP:0:0,pad=iw:$KEEP+$PAD:0:0:$BG,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=none" "$tmp"
    else
      ffmpeg -loglevel error -y -i "$file" -vf "crop=iw:$KEEP:0:0,pad=iw:$KEEP+$PAD:0:0:$BG" "$tmp"
    fi
    mv "$tmp" "$file"
    if [ "${file##*.}" = gif ]; then
      when=$(python3 scrub-usage.py "$file")
      if [ -n "$when" ]; then
        ffmpeg -loglevel error -y -i "$file" -filter_complex \
          "drawbox=x=0:y=666:w=iw:h=26:color=0x262626:t=fill:enable='$when',split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=none" "$tmp"
        mv "$tmp" "$file"
      fi
    else
      python3 scrub-usage.py "$file"
    fi
  done
done
