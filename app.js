// === app.js ===

let map;
let currentPos = null;

// ---- カテゴリ定義（強化版） ----
const CATEGORY_TYPES = {
  food: [
    "restaurant","cafe","bar","bakery",
    "meal_takeaway","meal_delivery"
  ],

  shopping: [
    "shopping_mall","clothing_store","convenience_store",
    "department_store","supermarket","home_goods_store",
    "electronics_store","book_store"
  ],

  outdoor: [
    "park","tourist_attraction","natural_feature",
    "campground","rv_park","art_gallery","museum",
    "aquarium","stadium",
    // 追加項目
    "bridge","observation_deck","viewpoint",
    "historical_landmark","shrine","place_of_worship",
    "landmark","spa"
  ],

  stay: [
    "lodging","hotel","guest_house","campground","rv_park"
  ]
};

// ---- 距離リング設定 ----
const DISTANCE_CONFIG = {
  near: { centerMin: 15000, centerMax: 15000, searchRadius: 2000 },
  mid:  { centerMin: 100000, centerMax: 100000, searchRadius: 10000 },
  far:  { centerMin: 200000, centerMax: 500000, searchRadius: 50000 }
};

// === Google Maps 初期化 ===
function initApp() {
  console.log("Google Maps Loaded");

  const div = document.createElement("div");
  div.style.width = "1px";
  div.style.height = "1px";
  div.style.opacity = "0";
  document.body.appendChild(div);

  map = new google.maps.Map(div, { center: { lat: 35, lng: 135 }, zoom: 5 });

  document.getElementById("searchBtn").onclick = searchPlaces;
}

// ---- 度↔ラジアン ----
const deg2rad = d => (d * Math.PI) / 180;
const rad2deg = r => (r * 180) / Math.PI;

// ---- origin から距離[m]のランダム地点を生成 ----
function randomPointAtDistance(origin, distanceMeters) {
  const R = 6371000;
  const lat1 = deg2rad(origin.lat);
  const lon1 = deg2rad(origin.lng);
  const bearing = Math.random() * 2 * Math.PI;
  const ang = distanceMeters / R;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(ang) +
    Math.cos(lat1) * Math.sin(ang) * Math.cos(bearing)
  );

  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(ang) * Math.cos(lat1),
      Math.cos(ang) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    lat: rad2deg(lat2),
    lng: ((rad2deg(lon2) + 540) % 360) - 180
  };
}

// ---- 配列から n 件ランダム抽出 ----
function pickRandomItems(arr, n) {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

// ---- ★ 提案ボタン押下時：位置情報取得 → 検索実行 ----
function getLocationForSearch() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      pos => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        });
      },
      err => reject(err)
    );
  });
}

// ---- メイン検索 ----
async function searchPlaces() {
  const status = document.getElementById("status");
  const results = document.getElementById("results");
  status.textContent = "現在地取得中…";
  results.innerHTML = "";

  try {
    // ★ 提案ボタン押下時に位置情報取得
    currentPos = await getLocationForSearch();
    status.textContent = "検索中…";

  } catch (err) {
    status.textContent = "位置情報の取得に失敗しました。許可してください。";
    return;
  }

  const category = document.getElementById("category").value;
  const distanceMode = document.getElementById("distance").value;
  const cfg = DISTANCE_CONFIG[distanceMode];
  const targetTypes = CATEGORY_TYPES[category];

  const ratingThreshold = 4.0;
  const maxPerCall = 5;
  const minBatches = 5;
  const maxBatches = 10;
  const targetSuggestions = 5;

  const placeMap = new Map();

  try {
    for (let i = 0; i < maxBatches; i++) {
      const dist = cfg.centerMin + Math.random() * (cfg.centerMax - cfg.centerMin);
      const centerPoint = randomPointAtDistance(currentPos, dist);

      const request = {
        fields: ["id", "displayName", "formattedAddress", "rating", "location"],
        locationRestriction: { center: centerPoint, radius: cfg.searchRadius },
        includedPrimaryTypes: targetTypes,
        maxResultCount: maxPerCall,
        rankPreference: google.maps.places.SearchNearbyRankPreference.POPULARITY
      };

      const { places } = await google.maps.places.Place.searchNearby(request);

      if (places) {
        for (const p of places) {
          if ((p.rating ?? 0) >= ratingThreshold) {
            if (!placeMap.has(p.id)) placeMap.set(p.id, p);
          }
        }
      }

      if (i + 1 >= minBatches && placeMap.size >= targetSuggestions) break;
    }

    const list = Array.from(placeMap.values());
    if (list.length === 0) {
      status.textContent = "該当スポットが見つかりませんでした。";
      return;
    }

    status.textContent = "検索完了！";
    const picked = pickRandomItems(list, targetSuggestions);

    let html = "<h3>候補一覧（ランダム提案）</h3>";

    picked.forEach((p, i) => {
      const name = encodeURIComponent(p.displayName);
      const url = `https://www.google.com/maps/search/?api=1&query=${name}&query_place_id=${p.id}`;

      html += `
        <div>
          <b>${i + 1}. ${p.displayName}</b><br>
          評価：${p.rating ?? "N/A"}<br>
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
