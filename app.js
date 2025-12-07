// app.js
console.log("App.js loaded");

// ------------------------------
// 定数
// ------------------------------
const SUGGESTION_COUNT = 5;
const MAX_BATCH_TRIES = 50;
const MIN_BATCH_HITS = 5;
const MIN_SUCCESS_BATCH = 5;

const CATEGORY_TYPES = {
  food: [
    "bagel_shop","bakery","bar","bar_and_grill","cafe","cafeteria",
    "candy_store","chocolate_factory","chocolate_shop","coffee_shop",
    "confectionery","deli","dessert_shop","diner","donut_shop",
    "food_court","ice_cream_shop","juice_shop","meal_takeaway",
    "pub","restaurant","sandwich_shop","steak_house","tea_house",
    "wine_bar"
  ],
  shopping: [
    "meal_takeaway","department_store","gift_shop","home_improvement_store",
    "market","shopping_mall","sporting_goods_store","store","warehouse_store",
    "wholesaler"
  ],
  outdoor: [
    "art_gallery","art_studio","auditorium","cultural_landmark",
    "historical_place","monument","museum","performing_arts_theater",
    "sculpture","adventure_sports_center","amphitheatre","amusement_center",
    "amusement_park","aquarium","banquet_hall","barbecue_area",
    "botanical_garden","bowling_alley","casino","childrens_camp",
    "comedy_club","community_center","concert_hall","convention_center",
    "cultural_center","cycling_park","dance_hall","dog_park","event_venue",
    "ferris_wheel","garden","hiking_area","historical_landmark",
    "internet_cafe","karaoke","marina","movie_rental","movie_theater",
    "national_park","night_club","observation_deck","off_roading_area",
    "opera_house","park","philharmonic_hall","picnic_ground","planetarium",
    "plaza","roller_coaster","skateboard_park"
  ],
  stay: [
    "bed_and_breakfast","campground","camping_cabin","cottage","guest_house",
    "hostel","hotel","inn","japanese_inn","lodging","mobile_home_park",
    "motel","private_guest_room","resort_hotel","rv_park"
  ],
};

// 距離設定
const DISTANCE_MODES = {
  justnow: { ringMinKm: 0.5, ringMaxKm: 0.5, radiusKm: 0.5 },
  near:    { ringMinKm: 15,  ringMaxKm: 15,  radiusKm: 2 },
  mid:     { ringMinKm: 50,  ringMaxKm: 50,  radiusKm: 5 },
  minitrip:{ ringMinKm: 100, ringMaxKm: 100, radiusKm: 10 },
  far:     { ringMinKm: 200, ringMaxKm: 800, radiusKm: 50 },
};

// 状態
let selectedCategory = "food";
let selectedMode = "justnow";

// DOM
const statusEl  = document.getElementById("status");
const resultsEl = document.getElementById("results");
const retryContainerEl = document.getElementById("retryContainer");
const loadingEl = document.getElementById("loading");
const searchBtn = document.getElementById("searchBtn");


// ------------------------------
// ユーティリティ
// ------------------------------
function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function computeOffset(lat, lng, distanceKm, headingRad) {
  const R = 6371;
  const dByR = distanceKm / R;

  const newLat = Math.asin(
    Math.sin(lat * Math.PI/180) * Math.cos(dByR) +
    Math.cos(lat * Math.PI/180) * Math.sin(dByR) * Math.cos(headingRad)
  );

  const newLng = lng * Math.PI/180 +
    Math.atan2(
      Math.sin(headingRad) * Math.sin(dByR) * Math.cos(lat * Math.PI/180),
      Math.cos(dByR) - Math.sin(lat * Math.PI/180) * Math.sin(newLat)
    );

  return {
    lat: newLat * 180 / Math.PI,
    lng: newLng * 180 / Math.PI
  };
}

function pickRandom(arr, count) {
  const copy = [...arr];
  const picked = [];
  while (picked.length < count && copy.length > 0) {
    const idx = Math.floor(Math.random() * copy.length);
    picked.push(copy.splice(idx, 1)[0]);
  }
  return picked;
}

function showLoading() {
  loadingEl.style.display = "flex";
}
function hideLoading() {
  loadingEl.style.display = "none";
}


// ------------------------------
// Nearby Search 1バッチ
// ------------------------------
async function searchOneBatch(modeKey, categoryKey, currentLatLng) {
  const mode = DISTANCE_MODES[modeKey];
  const ringKm = rand(mode.ringMinKm, mode.ringMaxKm);
  const radiusM = mode.radiusKm * 1000;

  const heading = rand(0, Math.PI * 2);
  const center = computeOffset(currentLatLng.lat, currentLatLng.lng, ringKm, heading);

  const includedTypes = CATEGORY_TYPES[categoryKey] || [];

  const request = {
    fields: [
      "id",
      "displayName",
      "primaryType",
      "primaryTypeDisplayName",
      "location",
      "rating",
      "formattedAddress",
      "userRatingCount",
      "photos",
    ],
    locationRestriction: {
      center: center,
      radius: radiusM,
    },
    maxResultCount: 20,
    includedPrimaryTypes: includedTypes,
    rankPreference: google.maps.places.SearchNearbyRankPreference.POPULARITY,
  };

  try {
    const response = await google.maps.places.Place.searchNearby(request);
    return response.places || [];
  } catch (err) {
    console.error("Batch error:", err);
    return [];
  }
}


// ------------------------------
// メイン検索
// ------------------------------
async function runSearch() {
  showLoading();
  searchBtn.disabled = true;
  statusEl.textContent = "位置情報を取得して検索中…";
  resultsEl.innerHTML = "";
  retryContainerEl.innerHTML = "";

  // 位置情報
  const position = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000
    });
  }).catch((err) => {
    console.error(err);
    statusEl.textContent = "位置情報の取得に失敗しました。ブラウザの位置情報設定を確認してください。";
    hideLoading();
    searchBtn.disabled = false;
    return null;
  });

  if (!position) return;

  const currentLatLng = {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
  };

  let poolById = new Map();
  let successBatchCount = 0;

  for (let i = 1; i <= MAX_BATCH_TRIES; i++) {
    const places = await searchOneBatch(selectedMode, selectedCategory, currentLatLng);
    console.log(`Batch ${i}: ${places.length}件`);

    const filtered = places.filter(p => p.rating >= 4.0);

    if (filtered.length >= MIN_BATCH_HITS) {
      successBatchCount++;
      filtered.forEach(p => poolById.set(p.id, p));
    }

    if (
      successBatchCount >= MIN_SUCCESS_BATCH &&
      poolById.size >= SUGGESTION_COUNT * 3
    ) {
      break;
    }
  }

  const finalCandidates = Array.from(poolById.values());

  if (finalCandidates.length === 0) {
    statusEl.textContent = "十分な件数が見つかりませんでした。再検索してみてください。";
    hideLoading();
    searchBtn.disabled = false;
    return;
  }

  const picked = pickRandom(finalCandidates, SUGGESTION_COUNT);

  resultsEl.innerHTML = picked.map(item => {
    const name = item.displayName || "名称不明";
    const type = item.primaryTypeDisplayName || "カテゴリ不明";
    const address = item.formattedAddress || "住所情報なし";
    const rating = item.rating != null ? item.rating : "評価なし";

    let photoHtml = "";
    if (item.photos && item.photos.length > 0) {
      const url = item.photos[0].getURI({
        maxHeight: 300,
        maxWidth: 400,
      });
      photoHtml = `<img src="${url}" alt="photo">`;
    }

    const mapsUrl =
      "https://www.google.com/maps/search/?api=1" +
      "&query=" + encodeURIComponent(name) +
      "&query_place_id=" + encodeURIComponent(item.id);

    return `
      <div class="result-card">
        ${photoHtml}
        <div class="place-info">
          <h3>${name}</h3>
          <p>${type}</p>
          <p>評価: ${rating}</p>
          <p>${address}</p>
          <a class="maps-link" href="${mapsUrl}" target="_blank" rel="noopener">
            Googleマップで見る <span>▶</span>
          </a>
        </div>
      </div>
    `;
  }).join("");

  // 一番下に「もう一回」ボタン
  const retryBtn = document.createElement("button");
  retryBtn.textContent = "もう一回";
  retryBtn.addEventListener("click", runSearch);
  retryContainerEl.innerHTML = "";
  retryContainerEl.appendChild(retryBtn);

  statusEl.textContent = "検索完了！気になる場所を選んでみてください。";
  hideLoading();
  searchBtn.disabled = false;
}


// ------------------------------
// UI 初期化
// ------------------------------
function initUI() {
  // カテゴリボタン
  const catContainer = document.getElementById("categoryButtons");
  catContainer.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-cat]");
    if (!btn) return;
    selectedCategory = btn.dataset.cat;
    [...catContainer.querySelectorAll("button")].forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  });

  // 距離ボタン
  const distContainer = document.getElementById("distanceButtons");
  distContainer.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-mode]");
    if (!btn) return;
    selectedMode = btn.dataset.mode;
    [...distContainer.querySelectorAll("button")].forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  });

  // 検索ボタン
  searchBtn.addEventListener("click", runSearch);

  // PWA: Service Worker 登録
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(console.error);
  }
}


// ------------------------------
// Google Maps callback
// ------------------------------
function initApp() {
  console.log("Google Maps Loaded");
  initUI();
}

// グローバルへ公開（Maps JS callback 用）
window.initApp = initApp;
