// === app.js ===

let map;
let currentPos = null;

// カテゴリ分類
const CATEGORY_TYPES = {
  food: [
    "restaurant",
    "cafe",
    "bar",
    "bakery",
    "meal_takeaway",
    "meal_delivery"
  ],
  shopping: [
    "shopping_mall",
    "clothing_store",
    "convenience_store",
    "department_store",
    "supermarket",
    "home_goods_store",
    "electronics_store",
    "book_store"
  ],
  outdoor: [
    "park",
    "tourist_attraction",
    "campground",
    "rv_park",
    "zoo",
    "art_gallery",
    "museum",
    "aquarium",
    "stadium"
  ]
};

// 距離モード設定
const DISTANCE_CONFIG = {
  near: { centerMin: 15000, centerMax: 15000, searchRadius: 2000 },      // 15km ±0, 半径2km
  mid:  { centerMin: 100000, centerMax: 100000, searchRadius: 10000 },  // 100km, 半径10km
  far:  { centerMin: 200000, centerMax: 500000, searchRadius: 50000 }   // 200〜500km, 半径50km
};

// Google Maps JS API の初期化
function initApp() {
  console.log("Google Maps Loaded");

  const div = document.createElement("div");
  div.style.width = "1px";
  div.style.height = "1px";
  div.style.opacity = "0";
  document.body.appendChild(div);

  map = new google.maps.Map(div, {
    center: { lat: 35, lng: 135 },
    zoom: 5
  });

  document.getElementById("getLocation").onclick = getLocation;
  document.getElementById("searchBtn").onclick = searchPlaces;
}

// 現在地取得
function getLocation() {
  const status = document.getElementById("status");
  status.textContent = "現在地取得中…";

  navigator.geolocation.getCurrentPosition(
    pos => {
      currentPos = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };
      status.textContent = `現在地：${currentPos.lat}, ${currentPos.lng}`;
    },
    err => {
      console.error(err);
      status.textContent = "位置情報取得に失敗しました";
    }
  );
}

// 度↔ラジアン変換
function deg2rad(d) { return (d * Math.PI) / 180; }
function rad2deg(r) { return (r * 180) / Math.PI; }

// origin から distance[m] 離れたランダム座標
function randomPointAtDistance(origin, distanceMeters) {
  const R = 6371000;
  const lat1 = deg2rad(origin.lat);
  const lon1 = deg2rad(origin.lng);

  const bearing = Math.random() * 2 * Math.PI;
  const angDist = distanceMeters / R;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angDist) +
    Math.cos(lat1) * Math.sin(angDist) * Math.cos(bearing)
  );

  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angDist) * Math.cos(lat1),
      Math.cos(angDist) - Math.sin(lat1) * Math.sin(lat2)
    );

  let lng = rad2deg(lon2);
  lng = ((lng + 540) % 360) - 180;

  return { lat: rad2deg(lat2), lng: lng };
}

// 設定からランダム距離を選ぶ
function randomDistanceForConfig(cfg) {
  if (cfg.centerMin === cfg.centerMax) return cfg.centerMin;
  return cfg.centerMin + Math.random() * (cfg.centerMax - cfg.centerMin);
}

// 配列から n件ランダム抽出
function pickRandomItems(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

// メイン検索ロジック
async function searchPlaces() {
  if (!currentPos) {
    alert("まず現在地を取得してください。");
    return;
  }

  const category = document.getElementById("category").value;
  const distanceMode = document.getElementById("distance").value;

  const status = document.getElementById("status");
  const results = document.getElementById("results");

  const cfg = DISTANCE_CONFIG[distanceMode];
  status.textContent = "検索中…";
  results.innerHTML = "";

  const targetTypes = CATEGORY_TYPES[category];
  const ratingThreshold = 4.0;

  const maxPerCall = 5;
  const minBatches = 5;
  const maxBatches = 10;
  const targetSuggestions = 3;

  const placeMap = new Map();

  try {
    for (let i = 0; i < maxBatches; i++) {
      const dist = randomDistanceForConfig(cfg);
      const centerPoint = randomPointAtDistance(currentPos, dist);

      const request = {
        fields: ["id", "displayName", "formattedAddress", "rating", "location"],
        locationRestriction: { center: centerPoint, radius: cfg.searchRadius },
        includedPrimaryTypes: targetTypes,
        maxResultCount: maxPerCall,
        rankPreference: google.maps.places.SearchNearbyRankPreference.POPULARITY
      };

      const { places } = await google.maps.places.Place.searchNearby(request);

      if (places && places.length > 0) {
        for (const p of places) {
          if (p.id && (p.rating ?? 0) >= ratingThreshold) {
            if (!placeMap.has(p.id)) placeMap.set(p.id, p);
          }
        }
      }

      if (i + 1 >= minBatches && placeMap.size >= targetSuggestions) break;
      console.log(`batch ${i + 1} done. collected: ${placeMap.size}`);
    }

    const candidates = Array.from(placeMap.values());

    if (candidates.length === 0) {
      status.textContent = "該当スポットが見つかりませんでした。";
      return;
    }

    status.textContent = "検索完了";

    const picked = pickRandomItems(
      candidates,
      Math.min(targetSuggestions, candidates.length)
    );

    let html = "<h3>候補一覧（ランダム提案）</h3>";

    picked.forEach((p, idx) => {
      const name = encodeURIComponent(p.displayName);
      const url = `https://www.google.com/maps/search/?api=1&query=${name}&query_place_id=${p.id}`;

      html += `
        <div style="margin-bottom: 12px;">
          <b>${idx + 1}. ${p.displayName}</b><br>
          評価: ${p.rating ?? "N/A"}<br>
          ${p.formattedAddress}<br>
          <a href="${url}" target="_blank">Google Maps で開く</a>
        </div>
      `;
    });

    results.innerHTML = html;

  } catch (err) {
    console.error(err);
    status.textContent = "検索中にエラー発生: " + err.message;
  }
}
