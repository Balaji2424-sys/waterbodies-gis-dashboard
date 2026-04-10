console.log("Dashboard loaded");

// Map
var map = L.map('map').setView([13.0827, 80.2707], 10);

// Base map
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Globals
var geojsonData;
var currentLayer;
var heatLayer;
var districtLayer;

// ================= ICONS (UPDATED TO MATCH DATASET) =================

var icons = {
    "Ponds": L.icon({ iconUrl: 'assets/icons/Ponds.png', iconSize: [28, 28] }),
    "Lakes": L.icon({ iconUrl: 'assets/icons/Lakes.png', iconSize: [28, 28] }),
    "Tank": L.icon({ iconUrl: 'assets/icons/Tank.png', iconSize: [28, 28] }),
    "Reservoir": L.icon({ iconUrl: 'assets/icons/Reservoir.png', iconSize: [28, 28] }),

    // special case (long dataset value)
    "checkdam": L.icon({ iconUrl: 'assets/icons/checkdam.png', iconSize: [28, 28] }),

    "Others": L.icon({ iconUrl: 'assets/icons/default.png', iconSize: [28, 28] })
};

// ================= LOAD DATA =================

fetch('./data/cleaned_waterbodies.geojson')
.then(res => res.json())
.then(data => {
    geojsonData = data;
    populateDistricts();
    renderLayer();
    updateAnalytics();
});

// DISTRICT BOUNDARIES
fetch('./data/districts.geojson')
.then(res => res.json())
.then(data => {
    districtLayer = L.geoJSON(data, {
        style: {
            color: "#555",
            weight: 1,
            fillOpacity: 0
        }
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

// ================= RENDER =================

function renderLayer() {

    let selectedDistrict = districtFilter.value.trim();
    let selectedType = typeFilter.value.trim();

    if (currentLayer) {
        map.removeLayer(currentLayer);
    }

    let cluster = L.markerClusterGroup();

    let layer = L.geoJSON(geojsonData, {

        filter: function(feature) {

            let fDistrict = (feature.properties.district || "").trim();

            let rawType =
                feature.properties.ref_water_body_type_id_name ||
                feature.properties.type || "";

            let fType = rawType.trim();

            let matchDistrict =
                selectedDistrict === "All" || fDistrict === selectedDistrict;

            let matchType =
                selectedType === "All" || fType === selectedType;

            return matchDistrict && matchType;
        },

        pointToLayer: function(feature, latlng) {

            let rawType =
                feature.properties.ref_water_body_type_id_name ||
                feature.properties.type || "";

            let iconKey;

            // HANDLE SPECIAL CASE
            if (rawType.toLowerCase().includes("check") ||
                rawType.toLowerCase().includes("dam")) {

                iconKey = "checkdam";

            } else {

                iconKey = rawType.trim();
            }

            return L.marker(latlng, {
                icon: icons[iconKey] || icons["Others"]
            });
        },

        onEachFeature: function(feature, layer) {

            let p = feature.properties;

            layer.bindPopup(`
                <b>${p.name || p.water_body_name || "N/A"}</b><br>
                Type: ${p.ref_water_body_type_id_name || p.type || "N/A"}<br>
                District: ${p.district || "N/A"}<br>
                State: ${p.state || "N/A"}<br>
                Lat: ${feature.geometry.coordinates[1]}<br>
                Lon: ${feature.geometry.coordinates[0]}
            `);
        }

    });

    cluster.addLayer(layer);
    currentLayer = cluster;

    map.addLayer(currentLayer);
}

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

// ================= FILTER EVENTS =================

districtFilter.onchange = function() {

    let d = this.value.trim();

    if (d !== "All") {
        zoomToDistrict(d);
    }

    renderLayer();
};

typeFilter.onchange = renderLayer;

// ================= SEARCH =================

function searchWaterbody() {

    let input = searchInput.value.trim();

    // LAT,LON search
    if (input.includes(",")) {

        let parts = input.split(",");
        let lat = parseFloat(parts[0]);
        let lon = parseFloat(parts[1]);

        if (!isNaN(lat) && !isNaN(lon)) {
            map.flyTo([lat, lon], 15);
            return;
        }
    }

    // NAME search
    let found = geojsonData.features.find(f =>
        (f.properties.name || f.properties.water_body_name || "")
        .toLowerCase().includes(input.toLowerCase())
    );

    if (found) {

        let lat = found.geometry.coordinates[1];
        let lon = found.geometry.coordinates[0];

        map.flyTo([lat, lon], 15);

    } else {
        alert("Not found");
    }
}

// ================= AUTOSUGGEST =================

searchInput.oninput = function() {

    let val = this.value.toLowerCase();
    suggestions.innerHTML = "";

    if (!val) return;

    let matches = geojsonData.features.filter(f =>
        (f.properties.name || f.properties.water_body_name || "")
        .toLowerCase().includes(val)
    ).slice(0, 5);

    matches.forEach(m => {

        let div = document.createElement("div");
        div.textContent = m.properties.name || m.properties.water_body_name;

        div.onclick = function() {

            let lat = m.geometry.coordinates[1];
            let lon = m.geometry.coordinates[0];

            map.flyTo([lat, lon], 15);

            searchInput.value = div.textContent;
            suggestions.innerHTML = "";
        };

        suggestions.appendChild(div);
    });
};

// ================= HEATMAP =================

function createHeatmap() {

    let points = geojsonData.features.map(f => [
        f.geometry.coordinates[1],
        f.geometry.coordinates[0],
        1
    ]);

    heatLayer = L.heatLayer(points);
}

heatToggle.onchange = function() {

    if (this.checked) {
        if (!heatLayer) createHeatmap();
        map.addLayer(heatLayer);
    } else {
        if (heatLayer) map.removeLayer(heatLayer);
    }
};

// ================= LEGEND =================

legendToggle.onchange = function() {
    legendBox.style.display = this.checked ? "block" : "none";
};

// ================= ANALYTICS =================

function updateAnalytics() {

    totalCount.innerText = geojsonData.features.length;

    pondCount.innerText =
        geojsonData.features.filter(f =>
            (f.properties.ref_water_body_type_id_name || "")
            .includes("Pond")
        ).length;

    lakeCount.innerText =
        geojsonData.features.filter(f =>
            (f.properties.ref_water_body_type_id_name || "")
            .includes("Lake")
        ).length;
}

// ================= SIDEBAR =================

let visible = true;

toggleBtn.onclick = function() {

    visible = !visible;

    if (!visible) {
        sidebar.classList.add("collapsed");
        this.innerHTML = "❯";
        this.style.left = "0px";
    } else {
        sidebar.classList.remove("collapsed");
        this.innerHTML = "❮";
        this.style.left = "310px";
    }
};