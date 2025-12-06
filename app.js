console.log("App.js loaded");

// -----------------------------
// 定数・設定
// -----------------------------

const SUGGESTION_COUNT = 5;      // 提案件数
const MAX_BATCH_TRIES = 50;      // バッチ最大試行回数（拡大）
const MIN_BATCH_HITS = 5;        // バッチを有効とみなす下限件数
const MIN_BATCH_TRIES = 5;       // 最低でもこの回数までは検索する（※成功バッチ数で管理）

// カテゴリごとの primaryType 群
const CATEGORY_TYPES = {
  food: [
    "restaurant", "cafe", "bar", "bakery",
    "meal_takeaway", "meal_delivery"
  ],
  shopping: [
    "shopping_mall", "store", "supermarket", "department_store"
  ],
  outdoor: [
    "tourist_attraction", "park", "campground", "rv_park",
    "natural_feature", "beach", "hiking_area", "scenic_lookout",
    "museum", "spa", "place_of_worship", "historical_landmark", "bridge"
  ],
  stay: [
    "lodging", "hotel", "motel", "campground", "rv_park", "guest_house"
  ]
};

// 距離プリセット
// key は <select id="distance"> の value と一致させる
const DISTANCE_PRESETS = {
  // ここらへん：現在地まわり 500m
  justnow: { ringKm: 0.5, radiusM: 500 },

  // 今から行く：15km リング・半径 2km
  near:    { ringKm: 15,  radiusM: 2000 },

  // 1日で行く：50km リング・半径 5km
  mid:     { ringKm: 50,  radiusM: 5000 },

  // 1泊まで：100km リング・半径 10km
  minitrip:{ ringKm: 100, radiusM: 10000 },

  // 旅行で行く：200〜800km リング・半径 50km（範囲指定）
  trip:    { ringMinKm: 200, ringMaxKm: 800, radiusM: 50000, isRange: true }
};

// -----------------------------
// ユーティリティ
// -----------------------------

function getDistancePreset(key) {
  const p = DISTANCE_PRESETS[key];
  if (!p) return DISTANCE_PRESETS.near;
  return p;
}

// lat/lng と距離(km)とランダム方位から新しい座標を生成
function randomPointFrom(lat, lng, preset) {
  let dKm;
  if (preset.isRange) {
    const min = preset.ringMinKm;
    const max = preset.ringMaxKm;
    dKm = min + Math.random() * (max - min);
  } else {
    dKm = preset.ringKm;
  }

  const R = 6371; // 地球半径 km
  const theta = Math.random() * 2 * Math.PI;

  const lat1 = lat * Math.PI / 180;
  const lng1 = lng * Math.PI / 180;
  const d = dKm / R;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) +
    Math.cos(lat1) * Math.sin(d) * Math.cos(theta)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );

  return {
    lat: lat2 * 180 / Math.PI,
    lng: lng2 * 180 / Math.PI
  };
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pickRandom(arr, count) {
  const tmp = [...arr];
  const out = [];
  while (tmp.length > 0 && out.length < count) {
    const idx = Math.floor(Math.random() * tmp.length);
    out.push(tmp[idx]);
    tmp.splice(idx, 1);
  }
  return out;
}

// -----------------------------
// Places 検索（1バッチ）
// -----------------------------

async function searchOneBatch(userPos, preset, categoryKey) {
  const { Place, SearchNearbyRankPreference } = google.maps.places;
  const types = CATEGORY_TYPES[categoryKey] || CATEGORY_TYPES.food;

  const center = randomPointFrom(userPos.lat, userPos.lng, preset);

  const request = {
    locationRestriction: {
      center,
      radius: preset.radiusM   // New Places API 正式形
    },
    includedPrimaryTypes: types,
    maxResultCount: 20,
    rankPreference: SearchNearbyRankPreference.POPULARITY,
    fields: [
      "id",
      "displayName",
      "formattedAddress",
      "primaryTypeDisplayName",
      "rating",
      "photos",
      "location"
    ]
  };

  try {
    const { places } = await Place.searchNearby(request);
    if (!places || places.length === 0) return [];

    // 星4.0以上に絞る
    return places.filter(p => (p.rating ?? 0) >= 4.0);
  } catch (e) {
    console.error("Batch error:", e);
    return [];
  }
}

// -----------------------------
// 結果描画
// -----------------------------

function renderResults(places, statusEl, resultsEl) {
  if (!places.length) {
    statusEl.textContent =
      "十分な件数が見つかりませんでした。再検索してみてください。";
    resultsEl.innerHTML = "";
    return;
  }

  statusEl.textContent = `候補 ${places.length} 件：`;

  const cards = places.map(p => {
    // 名称（LocalizedText or string 両対応）
    let name = "名称不明";
    if (typeof p.displayName === "string") {
      name = p.displayName;
    } else if (p.displayName && p.displayName.text) {
      name = p.displayName.text;
    }

    // カテゴリ名
    let category = "カテゴリ不明";
    if (typeof p.primaryTypeDisplayName === "string") {
      category = p.primaryTypeDisplayName;
    } else if (p.primaryTypeDisplayName && p.primaryTypeDisplayName.text) {
      category = p.primaryTypeDisplayName.text;
    }

    const rating = p.rating ?? "評価なし";
    const address = p.formattedAddress || "住所情報なし";

    // Google Map へのリンク（query + query_place_id）
    const mapUrl =
      "https://www.google.com/maps/search/?" +
      "api=1" +
      "&query=" + encodeURIComponent(name) +
      "&query_place_id=" + encodeURIComponent(p.id);

    // 写真（JS SDK の PlacePhoto.getUrl / getURI を利用）
    let photoHtml = "";
    if (Array.isArray(p.photos) && p.photos.length > 0) {
      const photo = p.photos[0];
      let photoUrl = "";

      if (typeof photo.getUrl === "function") {
        photoUrl = photo.getUrl({ maxWidth: 400, maxHeight: 300 });
      } else if (typeof photo.getURI === "function") {
        photoUrl = photo.getURI({ maxWidth: 400, maxHeight: 300 });
      }

      if (photoUrl) {
        photoHtml = `
          <div class="place-photo-wrap">
            <img class="place-photo"
                 src="${photoUrl}"
                 alt="${escapeHtml(name)} の写真">
          </div>`;
      }
    }

    return `
      <div class="place-card">
        ${photoHtml}
        <div class="place-main">
          <div class="place-name">${escapeHtml(name)}</div>
          <div class="place-category">${escapeHtml(category)}</div>
          <div class="place-rating">評価: ${rating}</div>
          <div class="place-address">${escapeHtml(address)}</div>
          <div class="place-link">
            <a href="${mapUrl}" target="_blank" rel="noopener">
              GoogleMapで開く
            </a>
          </div>
        </div>
      </div>
    `;
  });

  resultsEl.innerHTML = cards.join("\n");

  // 「もう一回！」ボタン
  const retryBtn = document.getElementById("retryBtn");
  if (retryBtn) {
    retryBtn.disabled = false;
    retryBtn.textContent = "もう一回！";
  }
}

// -----------------------------
// メイン検索処理
// -----------------------------

async function searchPlaces() {
  const categorySelect = document.getElementById("category");
  const distanceSelect = document.getElementById("distance");
  const statusEl = document.getElementById("status");
  const resultsEl = document.getElementById("results");
  const retryBtn = document.getElementById("retryBtn");

  if (!categorySelect || !distanceSelect || !statusEl || !resultsEl) {
    console.error("必要なDOM要素が見つかりません。");
    return;
  }

  if (retryBtn) {
    retryBtn.disabled = true;
    retryBtn.textContent = "再検索中…";
  }

  resultsEl.innerHTML = "";
  statusEl.textContent = "位置情報を取得中…";

  // 位置情報取得（毎回）
  let userPos;
  try {
    userPos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        err => reject(err),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  } catch (e) {
    console.error("位置情報エラー:", e);
    statusEl.textContent = "位置情報が取得できませんでした。";
    if (retryBtn) {
      retryBtn.disabled = false;
      retryBtn.textContent = "もう一回！";
    }
    return;
  }

  const categoryKey = categorySelect.value;
  const distanceKey = distanceSelect.value;
  const preset = getDistancePreset(distanceKey);

  statusEl.textContent = "候補を検索中…";
  console.log("=== Search Start ===");

  const poolById = new Map();
  let validBatchCount = 0;  // ★成功バッチ数（5件以上ヒット）

  for (let i = 0; i < MAX_BATCH_TRIES; i++) {
    const batch = await searchOneBatch(userPos, preset, categoryKey);
    console.log(`Batch ${i + 1}: ${batch.length}件`);

    if (batch.length >= MIN_BATCH_HITS) {
      // 成功バッチとしてカウント
      validBatchCount++;
      for (const p of batch) {
        if (!poolById.has(p.id)) {
          poolById.set(p.id, p);
        }
      }
    } else {
      console.log(" → 少数バッチなので破棄");
    }

    // ★ 0件バッチはカウントしない。
    // 「成功バッチ数」が MIN_BATCH_TRIES を超え、
    // かつ候補が十分たまったら終了。
    if (validBatchCount >= MIN_BATCH_TRIES &&
        poolById.size >= SUGGESTION_COUNT * 3) {
      break;
    }
  }

  console.log("=== Search End ===");

  const candidates = Array.from(poolById.values());
  if (!candidates.length || validBatchCount === 0) {
    renderResults([], statusEl, resultsEl);
    return;
  }

  const suggestions = pickRandom(candidates, SUGGESTION_COUNT);
  renderResults(suggestions, statusEl, resultsEl);
}

// -----------------------------
// Google Maps JS callback
// -----------------------------

window.initApp = function () {
  console.log("Google Maps Loaded");

  const searchBtn = document.getElementById("searchBtn");
  const retryBtn = document.getElementById("retryBtn");

  if (!searchBtn) {
    console.error("searchBtn が見つかりません。");
    return;
  }

  searchBtn.addEventListener("click", () => {
    searchPlaces().catch(e => {
      console.error(e);
      const statusEl = document.getElementById("status");
      if (statusEl) statusEl.textContent = "検索中にエラーが発生しました。";
    });
  });

  if (retryBtn) {
    retryBtn.addEventListener("click", () => {
      searchPlaces().catch(e => {
        console.error(e);
        const statusEl = document.getElementById("status");
        if (statusEl) statusEl.textContent = "検索中にエラーが発生しました。";
      });
    });
  }

  const statusEl = document.getElementById("status");
  if (statusEl) {
    statusEl.textContent = "カテゴリと距離を選んで「提案！」を押してください。";
  }
};
