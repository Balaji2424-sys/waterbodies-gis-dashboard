console.log("Dashboard loaded");

// ================= MAP =================
var map = L.map('map').setView([13.0827, 80.2707], 10);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// ================= GLOBALS =================
var geojsonData;
var currentLayer;
var heatLayer;
var districtLayer;
var renderId = 0; // 🔥 used to cancel old batches

// ================= CONFIG =================
const BATCH_SIZE = 1000;
const BATCH_DELAY = 30;

// ================= DOM FIX =================
const legendBox = document.getElementById("legendBox");

// ================= NORMALIZE =================
function normalize(value) {
    return (value || "").toString().trim().toLowerCase();
}

// ================= ICONS =================
var icons = {
    "ponds": L.icon({ iconUrl: 'assets/icons/Ponds.png', iconSize: [28, 28] }),
    "lakes": L.icon({ iconUrl: 'assets/icons/Lakes.png', iconSize: [28, 28] }),
    "tank": L.icon({ iconUrl: 'assets/icons/Tank.png', iconSize: [28, 28] }),
    "reservoir": L.icon({ iconUrl: 'assets/icons/Reservoir.png', iconSize: [28, 28] }),
    "checkdam": L.icon({ iconUrl: 'assets/icons/checkdam.png', iconSize: [28, 28] }),
    "others": L.icon({ iconUrl: 'assets/icons/default.png', iconSize: [28, 28] })
};

// ================= LOAD =================
fetch('./data/cleaned_waterbodies.geojson')
.then(res => res.json())
.then(data => {
    geojsonData = data;
    populateDistricts();
    renderLayer();
});

// ================= DISTRICT =================
fetch('./data/districts.geojson')
.then(res => res.json())
.then(data => {
    districtLayer = L.geoJSON(data, {
        style: { color: "#555", weight: 1, fillOpacity: 0 }
    }).addTo(map);
});

// ================= DROPDOWN =================
function populateDistricts() {
    let districts = new Set();

    geojsonData.features.forEach(f => {
        if (f.properties.district) {
            districts.add(f.properties.district.trim());
        }
    });

    let dropdown = document.getElementById("districtFilter");

    [...districts].sort().forEach(d => {
        let opt = document.createElement("option");
        opt.value = d;
        opt.textContent = d;
        dropdown.appendChild(opt);
    });
}

// ================= HEATMAP =================
function createHeatmap(data) {

    let points = data.map(f => [
        f.geometry.coordinates[1],
        f.geometry.coordinates[0],
        1
    ]);

    if (heatLayer) map.removeLayer(heatLayer);

    heatLayer = L.heatLayer(points, { radius: 25 });

    if (heatToggle.checked) {
        map.addLayer(heatLayer);
    }
}

// ================= RENDER =================
function renderLayer() {

    renderId++; // 🔥 invalidate old batches
    let currentRender = renderId;

    let selectedDistrict = districtFilter.value;
    let selectedType = typeFilter.value;

    if (currentLayer) map.removeLayer(currentLayer);

    let cluster = L.markerClusterGroup({
        chunkedLoading: true,
        chunkInterval: 300,
        chunkDelay: 80
    });

    let filtered = geojsonData.features.filter(f => {

        let d = normalize(f.properties.district);

        let rawType =
            f.properties.ref_water_body_type_id_name ||
            f.properties.type || "";

        let t = normalize(rawType);

        return (
            (normalize(selectedDistrict) === "all" || d === normalize(selectedDistrict)) &&
            (normalize(selectedType) === "all" || t.includes(normalize(selectedType)))
        );
    });

    updateAnalytics(filtered);
    createHeatmap(filtered); // 🔥 FIXED

    let index = 0;

    function processBatch() {

        // 🔥 STOP OLD RENDER
        if (currentRender !== renderId) return;

        let batch = filtered.slice(index, index + BATCH_SIZE);

        batch.forEach(feature => {

            let lat = feature.geometry.coordinates[1];
            let lon = feature.geometry.coordinates[0];

            let t = normalize(
                feature.properties.ref_water_body_type_id_name ||
                feature.properties.type
            );

            let iconKey = "others";

            if (t.includes("pond")) iconKey = "ponds";
            else if (t.includes("lake")) iconKey = "lakes";
            else if (t.includes("tank")) iconKey = "tank";
            else if (t.includes("reservoir")) iconKey = "reservoir";
            else if (t.includes("check") || t.includes("dam")) iconKey = "checkdam";

            let marker = L.marker([lat, lon], {
                icon: icons[iconKey]
            });

            marker.on('click', function () {
                let p = feature.properties;

                this.bindPopup(`
                    <b>${p.name || p.water_body_name || "N/A"}</b><br>
                    Type: ${p.ref_water_body_type_id_name || p.type || "N/A"}<br>
                    District: ${p.district || "N/A"}
                `).openPopup();
            });

            cluster.addLayer(marker);
        });

        index += BATCH_SIZE;

        if (index < filtered.length) {
            setTimeout(processBatch, BATCH_DELAY);
        }
    }

    processBatch();

    currentLayer = cluster;
    map.addLayer(cluster);
}

// ================= ANALYTICS =================
function updateAnalytics(data) {

    totalCount.innerText = data.length;

    let ponds = 0, lakes = 0;

    data.forEach(f => {
        let t = normalize(
            f.properties.ref_water_body_type_id_name ||
            f.properties.type
        );

        if (t.includes("pond")) ponds++;
        if (t.includes("lake")) lakes++;
    });

    pondCount.innerText = ponds;
    lakeCount.innerText = lakes;
}

// ================= FILTER EVENTS =================
districtFilter.onchange = function () {
    if (this.value !== "All") zoomToDistrict(this.value);
    renderLayer();
};

typeFilter.onchange = renderLayer;

// ================= HEAT TOGGLE =================
heatToggle.onchange = function () {
    if (this.checked && heatLayer) {
        map.addLayer(heatLayer);
    } else if (heatLayer) {
        map.removeLayer(heatLayer);
    }
};

// ================= LEGEND FIX =================
legendToggle.onchange = function () {
    legendBox.style.display = this.checked ? "block" : "none";
};

// ================= DISTRICT ZOOM =================
function zoomToDistrict(name) {

    if (!districtLayer) return;

    districtLayer.eachLayer(function(layer) {

        let d =
            (layer.feature.properties.district ||
             layer.feature.properties.DISTRICT ||
             layer.feature.properties.NAME || "").trim();

        if (d === name) {

            layer.setStyle({
                color: "red",
                weight: 3,
                fillOpacity: 0.2
            });

            map.flyToBounds(layer.getBounds(), {
                duration: 1.2
            });

        } else {
            districtLayer.resetStyle(layer);
        }
    });
}