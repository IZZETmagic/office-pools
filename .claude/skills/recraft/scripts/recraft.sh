#!/usr/bin/env bash
# recraft.sh — dependency-free helper for the Recraft external HTTP API.
#
# Everything here is curl + python3 (stdlib only). No node_modules, no install
# step, runs from any directory including a fresh worktree.
#
# The one rule this script exists to enforce: generated-image URLs are signed
# and expire in ~24 hours. Every command that produces an image DOWNLOADS IT
# IMMEDIATELY. There is no "fetch it later".

set -euo pipefail

API="https://external.api.recraft.ai/v1"
SELF="$(basename "$0")"

die() { printf '%s: %s\n' "$SELF" "$1" >&2; exit 1; }
note() { printf '%s\n' "$1" >&2; }

# ---------------------------------------------------------------- credentials

load_key() {
  [[ -n "${RECRAFT_API_KEY:-}" ]] && return 0
  local d="$PWD"
  while :; do
    if [[ -f "$d/.env.local" ]]; then
      local v
      v="$(grep -m1 '^[[:space:]]*RECRAFT_API_KEY=' "$d/.env.local" 2>/dev/null \
           | cut -d= -f2- | tr -d '\r' | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//')"
      if [[ -n "$v" ]]; then RECRAFT_API_KEY="$v"; export RECRAFT_API_KEY; return 0; fi
    fi
    [[ "$d" == "/" ]] && break
    d="$(dirname "$d")"
  done
  die "RECRAFT_API_KEY is not set and no .env.local containing it was found above $PWD"
}

# ------------------------------------------------------------------- pricing
# API units per image. 1,000 units = USD $1.00. Verified against
# https://www.recraft.ai/docs/api-reference/pricing on 2026-09-15.

price_of() {
  case "$1" in
    recraftv4_1|recraftv4_1_utility|recraftv4_styles) echo 35 ;;
    recraftv4|recraftv3)                              echo 40 ;;
    recraftv2)                                        echo 22 ;;
    recraftv2_vector)                                 echo 44 ;;
    recraftv4_styles_vector)                          echo 50 ;;
    recraftv4_1_vector|recraftv4_1_utility_vector|recraftv4_vector|recraftv3_vector) echo 80 ;;
    recraftv4_styles_pro)                             echo 100 ;;
    recraftv4_styles_pro_vector)                      echo 120 ;;
    recraftv4_1_pro|recraftv4_1_utility_pro)          echo 210 ;;
    recraftv4_pro)                                    echo 250 ;;
    recraftv4_1_pro_vector|recraftv4_1_utility_pro_vector|recraftv4_pro_vector) echo 300 ;;
    *) echo 0 ;;
  esac
}

usd() { python3 -c "print(f'\${int(${1})/1000:.3f}')"; }

# ------------------------------------------------------------ response handling
# Generation returns {"data":[{"url":...}], "credits":N, "style_id":...}
# Utilities return  {"image":{"url":...}, "credits":N}

# shellcheck disable=SC2120
extract_urls() {
  python3 -c '
import json,sys
d=json.load(sys.stdin)
for it in d.get("data") or []:
    if it.get("url"): print(it["url"])
img=d.get("image") or {}
if img.get("url"): print(img["url"])
'
}

report_charge() {
  python3 -c '
import json,sys
d=json.load(sys.stdin)
c=d.get("credits")
if c is not None:
    print(f"charged: {c} API units (${c/1000:.3f})", file=sys.stderr)
sid=d.get("style_id")
if sid:
    print("style_id: " + str(sid), file=sys.stderr)
'
}

# Fail loudly on a non-2xx instead of writing an error page to disk.
check_http() {
  local code="$1" body="$2"
  if [[ "$code" -lt 200 || "$code" -ge 300 ]]; then
    note "HTTP $code"
    printf '%s\n' "$body" >&2
    exit 1
  fi
}

# Download every URL on stdin into $1. Prints the local paths.
#
# The extension comes from SNIFFING THE BYTES, not from the URL: Recraft's
# signed URLs carry no usable extension, and a vector generation silently
# saved as .png is a trap for everything downstream.
sniff_ext() {
  python3 -c '
import sys
b=open(sys.argv[1],"rb").read(512)
h=b.lstrip()
if b[:8]==bytes([137,80,78,71,13,10,26,10]): print("png")
elif b[:3]==bytes([255,216,255]): print("jpg")
elif b[:4]==b"RIFF" and b[8:12]==b"WEBP": print("webp")
elif h[:4]==b"<svg" or (h[:5]==b"<?xml" and b"<svg" in b): print("svg")
else: print("bin")
' "$1"
}

download_all() {
  local outdir="$1" stem="$2" i=0 url tmp ext path
  mkdir -p "$outdir"
  while IFS= read -r url; do
    [[ -z "$url" ]] && continue
    tmp="$outdir/.${stem}-$$-$i.part"
    curl -sS -f -o "$tmp" "$url" || { rm -f "$tmp"; die "download failed (a signed Recraft URL is valid ~24h only): $url"; }
    ext="$(sniff_ext "$tmp")"
    [[ "$ext" == "bin" ]] && note "warning: unrecognised image format, saved as .bin"
    path="$outdir/${stem}-$(printf '%02d' "$i").$ext"
    mv "$tmp" "$path"
    printf '%s\n' "$path"
    i=$((i+1))
  done
}

# --------------------------------------------------------------- subcommands

cmd_balance() {
  load_key
  curl -sS "$API/users/me" -H "Authorization: Bearer $RECRAFT_API_KEY" | python3 -c '
import json,sys
d=json.load(sys.stdin)
c=d.get("credits",0)
print(f"{c} API units  =  ${c/1000:.2f}")
'
}

cmd_generate() {
  local prompt="" model="" style_id="" style="" style_match="" size="" n=1
  local negative="" seed="" out="recraft-out" stem="gen" dry=0
  local -a refs=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --prompt) prompt="$2"; shift 2 ;;
      --model) model="$2"; shift 2 ;;
      --style-id) style_id="$2"; shift 2 ;;
      --style) style="$2"; shift 2 ;;
      --style-match) style_match="$2"; shift 2 ;;
      --size) size="$2"; shift 2 ;;
      --n) n="$2"; shift 2 ;;
      --negative) negative="$2"; shift 2 ;;
      --seed) seed="$2"; shift 2 ;;
      --ref) refs+=("$2"); shift 2 ;;
      --out) out="$2"; shift 2 ;;
      --name) stem="$2"; shift 2 ;;
      --dry-run) dry=1; shift ;;
      *) die "unknown option for generate: $1" ;;
    esac
  done
  [[ -n "$prompt" ]] || die "generate needs --prompt"
  [[ -n "$style_id" && ${#refs[@]} -gt 0 ]] && die "--style-id and --ref are mutually exclusive; the API rejects both together"
  [[ ${#refs[@]} -gt 10 ]] && die "at most 10 style reference images"

  local est per
  per="$(price_of "${model:-recraftv4_1}")"
  est=$((per * n))
  [[ ${#refs[@]} -gt 0 ]] && est=$((est + 5))   # composite billing: style creation
  note "estimate: ${est} API units ($(usd "$est"))  [${n} x ${model:-recraftv4_1}$( [[ ${#refs[@]} -gt 0 ]] && echo ' + style creation' )]"

  local body
  body="$(RC_PROMPT="$prompt" RC_MODEL="$model" RC_STYLE_ID="$style_id" \
          RC_STYLE="$style" RC_MATCH="$style_match" RC_SIZE="$size" RC_N="$n" \
          RC_NEG="$negative" RC_SEED="$seed" python3 -c '
import json,os
b={"prompt":os.environ["RC_PROMPT"],"n":int(os.environ["RC_N"])}
for key,env in (("model","RC_MODEL"),("style_id","RC_STYLE_ID"),("style","RC_STYLE"),
                ("style_match","RC_MATCH"),("size","RC_SIZE"),("negative_prompt","RC_NEG")):
    v=os.environ.get(env,"")
    if v: b[key]=v
s=os.environ.get("RC_SEED","")
if s: b["random_seed"]=int(s)
print(json.dumps(b))
')"

  if [[ $dry -eq 1 ]]; then
    note "--dry-run: not sent. Request body:"
    printf '%s\n' "$body" | python3 -m json.tool
    [[ ${#refs[@]} -gt 0 ]] && note "plus ${#refs[@]} style reference file(s): ${refs[*]}"
    return 0
  fi

  load_key
  local resp code json
  if [[ ${#refs[@]} -gt 0 ]]; then
    # Multipart: fields as -F, each reference as a style_references file part.
    local -a args=()
    while IFS= read -r line; do args+=(-F "$line"); done < <(
      printf '%s' "$body" | python3 -c '
import json,sys
for k,v in json.load(sys.stdin).items(): print(f"{k}={v}")
')
    for f in "${refs[@]}"; do
      [[ -f "$f" ]] || die "style reference not found: $f"
      args+=(-F "style_references=@$f")
    done
    resp="$(curl -sS -w $'\n%{http_code}' -X POST "$API/images/generations" \
      -H "Authorization: Bearer $RECRAFT_API_KEY" "${args[@]}")"
  else
    resp="$(curl -sS -w $'\n%{http_code}' -X POST "$API/images/generations" \
      -H "Authorization: Bearer $RECRAFT_API_KEY" -H "Content-Type: application/json" \
      -d "$body")"
  fi
  code="${resp##*$'\n'}"; json="${resp%$'\n'*}"
  check_http "$code" "$json"

  # Download FIRST. A bug in reporting must never strand an image behind a
  # signed URL that expires in 24 hours. (This is not hypothetical: an earlier
  # version of this script crashed in report_charge after a successful 2xx and
  # lost a paid-for generation.)
  printf '%s' "$json" | extract_urls | download_all "$out" "$stem"
  printf '%s' "$json" | report_charge
}

cmd_style() {
  local model="recraftv4_styles" match="" style="" out_json=""
  local -a files=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --model) model="$2"; shift 2 ;;
      --match) match="$2"; shift 2 ;;
      --style) style="$2"; shift 2 ;;
      --json) out_json="$2"; shift 2 ;;
      *) files+=("$1"); shift ;;
    esac
  done
  [[ ${#files[@]} -ge 1 ]] || die "style needs at least one reference image"
  [[ ${#files[@]} -le 10 ]] || die "at most 10 reference images"
  load_key
  note "estimate: 5 API units (\$0.005)"
  local -a args=(-F "model=$model")
  [[ -n "$match" ]] && args+=(-F "match=$match")
  [[ -n "$style" ]] && args+=(-F "style=$style")
  local i=1
  for f in "${files[@]}"; do
    [[ -f "$f" ]] || die "reference not found: $f"
    args+=(-F "file${i}=@$f"); i=$((i+1))
  done
  local resp code json
  resp="$(curl -sS -w $'\n%{http_code}' -X POST "$API/styles" \
    -H "Authorization: Bearer $RECRAFT_API_KEY" "${args[@]}")"
  code="${resp##*$'\n'}"; json="${resp%$'\n'*}"
  check_http "$code" "$json"
  [[ -n "$out_json" ]] && printf '%s\n' "$json" > "$out_json"
  printf '%s\n' "$json" | python3 -m json.tool
  printf '%s\n' "$json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])'
}

# vectorize / removebg / crispupscale / creativeupscale share one shape.
cmd_file_op() {
  local op="$1" field="$2"; shift 2
  local in="" out="recraft-out" stem="$op"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --out) out="$2"; shift 2 ;;
      --name) stem="$2"; shift 2 ;;
      *) in="$1"; shift ;;
    esac
  done
  [[ -f "$in" ]] || die "$op needs an input file"
  load_key
  local resp code json
  resp="$(curl -sS -w $'\n%{http_code}' -X POST "$API/images/$op" \
    -H "Authorization: Bearer $RECRAFT_API_KEY" -F "$field=@$in")"
  code="${resp##*$'\n'}"; json="${resp%$'\n'*}"
  check_http "$code" "$json"
  printf '%s' "$json" | extract_urls | download_all "$out" "$stem"
  printf '%s' "$json" | report_charge
}

cmd_download() {
  [[ $# -eq 2 ]] || die "download needs <url> <outfile>"
  curl -sS -f -o "$2" "$1" || die "download failed — a signed Recraft URL is only valid ~24h"
  printf '%s\n' "$2"
}

# Deliberately-failing request. Costs nothing: units are deducted only on 2xx.
cmd_probe() {
  [[ $# -ge 1 ]] || die "probe needs <path> [json-body]"
  load_key
  local path="$1" body="${2:-{\}}"
  curl -sS -X POST "$API/$path" \
    -H "Authorization: Bearer $RECRAFT_API_KEY" -H "Content-Type: application/json" \
    -d "$body" -w $'\n[HTTP %{http_code}]\n'
}

usage() {
  cat <<'USAGE'
recraft.sh — Recraft external HTTP API helper (spends API units, not subscription credits)

  balance                          Account balance in API units. Free.
  generate --prompt "..." [opts]   Generate, then download every result.
      --model M --style-id UUID --style NAME --style-match precise|flexible
      --size WxH|w:h --n 1..6 --negative "..." --seed N
      --ref FILE (repeatable, max 10; mutually exclusive with --style-id)
      --out DIR --name STEM --dry-run
  style FILE... [--model M] [--match precise|flexible] [--style S] [--json F]
                                   Create a reusable style. 5 units ($0.005).
  vectorize FILE  [--out DIR]      Raster -> SVG. 10 units.
  removebg FILE   [--out DIR]      Transparent cutout. 10 units.
  upscale FILE    [--out DIR]      Crisp upscale. 4 units.
  bigupscale FILE [--out DIR]      Creative upscale. 250 units ($0.25).
  download URL OUTFILE             Fetch a signed URL (valid ~24h only).
  probe PATH [JSON]                Send a deliberately-invalid request. Free.

Key: $RECRAFT_API_KEY, else RECRAFT_API_KEY= in the nearest .env.local above $PWD.
USAGE
}

main() {
  [[ $# -eq 0 ]] && { usage; exit 1; }
  local cmd="$1"; shift
  case "$cmd" in
    balance)     cmd_balance "$@" ;;
    generate)    cmd_generate "$@" ;;
    style)       cmd_style "$@" ;;
    vectorize)   cmd_file_op vectorize file "$@" ;;
    removebg)    cmd_file_op removeBackground file "$@" ;;
    upscale)     cmd_file_op crispUpscale file "$@" ;;
    bigupscale)  cmd_file_op creativeUpscale file "$@" ;;
    download)    cmd_download "$@" ;;
    probe)       cmd_probe "$@" ;;
    -h|--help|help) usage ;;
    *) die "unknown command: $cmd (try --help)" ;;
  esac
}

main "$@"
