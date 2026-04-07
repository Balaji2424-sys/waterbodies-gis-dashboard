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

// Icons
var icons = {
    "Pond": L.icon({ iconUrl: 'assets/icons/pond.png', iconSize: [28, 28] }),
    "Lake": L.icon({ iconUrl: 'assets/icons/lake.png', iconSize: [28, 28] }),
    "Tank": L.icon({ iconUrl: 'assets/icons/tank.png', iconSize: [28, 28] }),
    "Reservoir": L.icon({ iconUrl: 'assets/icons/dam.png', iconSize: [28, 28] }),
    "Check Dam": L.icon({ iconUrl: 'assets/icons/checkdam.png', iconSize: [28, 28] }),
    "Others": L.icon({ iconUrl: 'assets/icons/default.png', iconSize: [28, 28] })
};

// Load data
fetch('./data/cleaned_waterbodies.geojson')
.then(res => res.json())
.then(data => {
    geojsonData = data;
    populateDistricts();
    renderLayer();
});

// Populate districts
function populateDistricts() {
    var districts = new Set();

    geojsonData.features.forEach(f => {
        if (f.properties.district) {
            districts.add(f.properties.district);
        }
    });

    var dropdown = document.getElementById("districtFilter");

    [...districts].sort().forEach(d => {
        var option = document.createElement("option");
        option.value = d;
        option.textContent = d;
        dropdown.appendChild(option);
    });
}

// Render layer
function renderLayer() {

    var district = document.getElementById("districtFilter").value;
    var type = document.getElementById("typeFilter").value;

    if (currentLayer) {
        map.removeLayer(currentLayer);
    }

    var cluster = L.markerClusterGroup();

    var layer = L.geoJSON(geojsonData, {

        filter: function(feature) {
            return (district === "All" || feature.properties.district === district) &&
                   (type === "All" || feature.properties.type === type);
        },

        pointToLayer: function(feature, latlng) {
            var t = feature.properties.type || "Others";
            return L.marker(latlng, {
                icon: icons[t] || icons["Others"]
            });
        },

        onEachFeature: function(feature, layer) {
            layer.bindPopup(`
                <b>${feature.properties.name}</b><br>
                Type: ${feature.properties.type}<br>
                District: ${feature.properties.district}
            `);
        }

    });

    cluster.addLayer(layer);
    currentLayer = cluster;
    map.addLayer(currentLayer);
}

// Search
function searchWaterbody() {
    var input = document.getElementById("searchInput").value.toLowerCase();

    geojsonData.features.forEach(f => {
        if (f.properties.name.toLowerCase().includes(input)) {
            var lat = f.geometry.coordinates[1];
            var lon = f.geometry.coordinates[0];
            map.setView([lat, lon], 15);
        }
    });
}

// Heatmap
function createHeatmap() {
    var points = [];

    geojsonData.features.forEach(f => {
        var lat = f.geometry.coordinates[1];
        var lon = f.geometry.coordinates[0];
        points.push([lat, lon, 1]);
    });

    heatLayer = L.heatLayer(points, {
        radius: 20,
        blur: 15
    });
}

// Heat toggle
document.getElementById("heatToggle").addEventListener("change", function() {
    if (this.checked) {
        if (!heatLayer) createHeatmap();
        map.addLayer(heatLayer);
    } else {
        if (heatLayer) map.removeLayer(heatLayer);
    }
});

// Legend toggle
document.getElementById("legendToggle").addEventListener("change", function() {
    document.getElementById("legendBox").style.display =
        this.checked ? "block" : "none";
});

// Filters
document.getElementById("districtFilter").addEventListener("change", renderLayer);
document.getElementById("typeFilter").addEventListener("change", renderLayer);