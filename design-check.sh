#!/bin/bash
# Dr. Erkens Website - Design & Performance Check
# Fuehre aus: ./design-check.sh

BASE="https://drerkens.vercel.app"
LOCAL="/Users/juliusjansen/zahnarzt-heidrich/drerkens/public"
PASS=0
WARN=0
FAIL=0

green()  { echo -e "\033[32m$1\033[0m"; }
yellow() { echo -e "\033[33m$1\033[0m"; }
red()    { echo -e "\033[31m$1\033[0m"; }

check_ok()   { echo "  ✅ $1"; PASS=$((PASS+1)); }
check_warn() { echo "  ⚠️  $1"; WARN=$((WARN+1)); }
check_fail() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

echo ""
echo "🎨 Dr. Erkens Design & Performance Check"
echo "========================================="
echo ""

# === BILDERGROESSE ===
echo "📸 Bildergrößen:"
for img in "$LOCAL"/*.jpg; do
    name=$(basename "$img")
    size=$(stat -f%z "$img" 2>/dev/null || stat -c%s "$img" 2>/dev/null)
    kb=$((size / 1024))
    if [ "$kb" -gt 500 ]; then
        check_fail "$name: ${kb}KB (zu groß, >500KB)"
    elif [ "$kb" -gt 200 ]; then
        check_warn "$name: ${kb}KB (kann optimiert werden)"
    else
        check_ok "$name: ${kb}KB"
    fi
done
echo ""

# === SEITENSGROESSE ===
echo "📄 Seitengrößen (HTML):"
for page in index diagnostik therapie wochenplan admin mitarbeiter dashboard login; do
    file="$LOCAL/$page.html"
    if [ -f "$file" ]; then
        size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
        kb=$((size / 1024))
        lines=$(wc -l < "$file")
        if [ "$kb" -gt 50 ]; then
            check_warn "$page.html: ${kb}KB, ${lines} Zeilen (groß)"
        else
            check_ok "$page.html: ${kb}KB, ${lines} Zeilen"
        fi
    fi
done
echo ""

# === LADEZEITEN ===
echo "⚡ Ladezeiten:"
for page in "" diagnostik.html therapie.html wochenplan.html admin.html mitarbeiter.html dashboard.html login.html; do
    url="$BASE/$page"
    name="${page:-index.html}"
    time_total=$(curl -s -o /dev/null -w "%{time_total}" "$url" 2>/dev/null)
    ms=$(echo "$time_total * 1000" | bc 2>/dev/null | cut -d. -f1)
    if [ -z "$ms" ]; then ms=0; fi
    if [ "$ms" -gt 3000 ]; then
        check_fail "$name: ${ms}ms (langsam)"
    elif [ "$ms" -gt 1500 ]; then
        check_warn "$name: ${ms}ms"
    else
        check_ok "$name: ${ms}ms"
    fi
done
echo ""

# === META TAGS ===
echo "🏷️  Meta Tags:"
for page in index diagnostik therapie; do
    file="$LOCAL/$page.html"
    desc=$(grep -c 'meta name="description"' "$file" 2>/dev/null)
    viewport=$(grep -c 'meta name="viewport"' "$file" 2>/dev/null)
    title=$(grep -c '<title>' "$file" 2>/dev/null)
    if [ "$desc" -eq 0 ]; then check_warn "$page.html: fehlende meta description"; else check_ok "$page.html: meta description vorhanden"; fi
    if [ "$viewport" -eq 0 ]; then check_fail "$page.html: fehlende viewport meta"; else check_ok "$page.html: viewport meta vorhanden"; fi
    if [ "$title" -eq 0 ]; then check_fail "$page.html: fehlender title"; else check_ok "$page.html: title vorhanden"; fi
done
echo ""

# === DUPLIZIERTER CODE ===
echo "🔄 Code-Duplikate:"
css_count=$(grep -l "var(--primary)" "$LOCAL"/*.html 2>/dev/null | wc -l)
check_warn "CSS-Variablen in $css_count Dateien dupliziert (könnte extern ausgelagert werden)"
js_fadein=$(grep -l "fade-in" "$LOCAL"/*.html 2>/dev/null | wc -l)
check_warn "fade-in JS in $js_fadein Dateien dupliziert"
echo ""

# === RESPONSIVE ===
echo "📱 Responsive:"
for page in index diagnostik therapie; do
    file="$LOCAL/$page.html"
    has_media=$(grep -c '@media' "$file" 2>/dev/null)
    if [ "$has_media" -eq 0 ]; then
        check_fail "$page.html: keine Media Queries"
    else
        check_ok "$page.html: $has_media Media Queries"
    fi
done
echo ""

# === ZUSAMMENFASSUNG ===
TOTAL=$((PASS+WARN+FAIL))
echo "========================================="
echo "📊 Ergebnis: $PASS OK | $WARN Warnungen | $FAIL Fehler (von $TOTAL)"
if [ $FAIL -gt 0 ]; then
    red "🔴 $FAIL kritische Probleme"
elif [ $WARN -gt 0 ]; then
    yellow "🟡 $WARN Warnungen, keine kritischen Fehler"
else
    green "🟢 Alles optimal!"
fi
echo ""