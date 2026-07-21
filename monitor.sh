#!/bin/bash
# Dr. Erkens Website - Error Monitoring Loop
# Fuehre aus: ./monitor.sh

BASE="https://drerkens.vercel.app"
PASS=0
FAIL=0
ERRORS=""

check() {
    local url="$1"
    local name="$2"
    local expected="$3"
    local result
    result=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
    if [ "$result" = "$expected" ]; then
        echo "  ✅ $name ($result)"
        PASS=$((PASS+1))
    else
        echo "  ❌ $name (erwartet: $expected, bekommen: $result)"
        FAIL=$((FAIL+1))
        ERRORS="$ERRORS\n  - $name: HTTP $result"
    fi
}

check_post() {
    local url="$1"
    local name="$2"
    local data="$3"
    local expected="$4"
    local result
    result=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$url" -H 'Content-Type: application/json' -d "$data" 2>/dev/null)
    if [ "$result" = "$expected" ]; then
        echo "  ✅ $name ($result)"
        PASS=$((PASS+1))
    else
        echo "  ❌ $name (erwartet: $expected, bekommen: $result)"
        FAIL=$((FAIL+1))
        ERRORS="$ERRORS\n  - $name: HTTP $result"
    fi
}

echo ""
echo "🔍 Dr. Erkens Error Monitor"
echo "==========================="
echo ""

# === SEITEN ===
echo "📄 Seiten:"
check "$BASE/" "Startseite" "200"
check "$BASE/diagnostik.html" "Diagnostik" "200"
check "$BASE/therapie.html" "Therapie" "200"
check "$BASE/wochenplan.html" "Wochenplan" "200"
check "$BASE/admin.html" "Admin Panel" "200"
check "$BASE/mitarbeiter.html" "Mitarbeiter" "200"
check "$BASE/dashboard.html" "Dashboard" "200"
check "$BASE/login.html" "Login" "200"
echo ""

# === API ENDPOINTS (GET) ===
echo "🔌 API (GET):"
check "$BASE/api/health" "Health Check" "200"
check "$BASE/api/appointments" "Appointments" "200"
check "$BASE/api/vacation" "Vacation" "200"
check "$BASE/api/work-schedule" "Work Schedule" "200"
check "$BASE/api/blocked-slots" "Blocked Slots" "200"
echo ""

# === API ENDPOINTS (POST) ===
echo "🔌 API (POST):"
check_post "$BASE/api/wochenplan/login" "Wochenplan Login" '{"pin":"3911","role":"Assistenz"}' "200"
check_post "$BASE/api/admin/login" "Admin Login" '{"email":"admin@drerkens.de","password":"Onix1111"}' "200"
echo ""

# === BILDER ===
echo "🖼️  Bilder:"
check "$BASE/diagnostik.jpg" "diagnostik.jpg" "200"
check "$BASE/therapie.jpg" "therapie.jpg" "200"
check "$BASE/diagnostik-analyse.jpg" "diagnostik-analyse.jpg" "200"
check "$BASE/therapie-analyse.jpg" "therapie-analyse.jpg" "200"
check "$BASE/golf-1.jpg" "golf-1.jpg" "200"
check "$BASE/golf-2.jpg" "golf-2.jpg" "200"
check "$BASE/dr-erkens.jpg" "dr-erkens.jpg" "200"
echo ""

# === ZUSAMMENFASSUNG ===
TOTAL=$((PASS+FAIL))
echo "==========================="
echo "📊 Ergebnis: $PASS/$TOTAL bestanden"
if [ $FAIL -gt 0 ]; then
    echo ""
    echo "⚠️  $FAIL Fehler:"
    echo -e "$ERRORS"
else
    echo "🎉 Alles OK!"
fi
echo ""