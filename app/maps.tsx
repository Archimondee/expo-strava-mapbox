import {
	View,
	StyleSheet,
	Button,
	Modal,
	Text,
	ScrollView,
} from "react-native";
import MapboxGL from "@rnmapbox/maps";
import { useEffect, useState, useRef } from "react";
import * as Location from "expo-location";
import * as FileSystem from "expo-file-system";

MapboxGL.setAccessToken(process.env.EXPO_PUBLIC_MAP_BOX || "");

export default function MapsScreen() {
	const [location, setLocation] = useState({ latitude: 0, longitude: 0 });
	const [coordinates, setCoordinates] = useState([] as any);
	const [tracking, setTracking] = useState(false);
	const locationSubscription = useRef<Location.LocationSubscription | null>(
		null
	);
	const [showPreview, setShowPreview] = useState(false);
	const [gpxContent, setGpxContent] = useState("");
	const [stats, setStats] = useState({
		currentSpeed: 0,
		totalDistance: 0,
		elevation: 0,
		movingTime: 0,
		lastUpdateTime: 0,
	});

	useEffect(() => {
		(async () => {
			let { status } = await Location.requestForegroundPermissionsAsync();
			if (status !== "granted") {
				console.log("Permission to access location was denied");
				return;
			}

			// Get initial location
			const initialLocation = await Location.watchPositionAsync(
				{
					accuracy: Location.Accuracy.BestForNavigation,
					timeInterval: 2000,
					distanceInterval: 5,
				},
				(pos) => {
					const { latitude, longitude } = pos.coords;
					setLocation({ latitude, longitude });
				}
			);
		})();

		// Cleanup subscription when component unmounts
		return () => {
			if (locationSubscription.current) {
				locationSubscription.current.remove();
			}
		};
	}, []);

	const calculateDistance = (
		lat1: number,
		lon1: number,
		lat2: number,
		lon2: number
	) => {
		const R = 6371e3; // Earth's radius in meters
		const φ1 = (lat1 * Math.PI) / 180;
		const φ2 = (lat2 * Math.PI) / 180;
		const Δφ = ((lat2 - lat1) * Math.PI) / 180;
		const Δλ = ((lon2 - lon1) * Math.PI) / 180;

		const a =
			Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
			Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

		return R * c; // Distance in meters
	};

	const startTracking = async () => {
		setTracking(true);
		setCoordinates([]);
		setStats({
			currentSpeed: 0,
			totalDistance: 0,
			elevation: 0,
			movingTime: 0,
			lastUpdateTime: Date.now(),
		});

		locationSubscription.current = await Location.watchPositionAsync(
			{
				accuracy: Location.Accuracy.BestForNavigation,
				timeInterval: 2000,
				distanceInterval: 5,
			},
			(pos) => {
				const { latitude, longitude, speed, altitude } = pos.coords;
				const currentTime = Date.now();

				setLocation({ latitude, longitude });

				setCoordinates((prev: any) => {
					const newCoords = [...prev, [longitude, latitude]];

					// Calculate total distance
					if (prev.length > 0) {
						const lastCoord = prev[prev.length - 1];
						const newDistance = calculateDistance(
							lastCoord[1],
							lastCoord[0],
							latitude,
							longitude
						);

						setStats((current) => ({
							currentSpeed: speed ? speed * 3.6 : 0, // Convert m/s to km/h
							totalDistance: current.totalDistance + newDistance,
							elevation: altitude || 0,
							movingTime:
								speed && speed > 0.5
									? current.movingTime +
									  (currentTime - current.lastUpdateTime) / 1000
									: current.movingTime,
							lastUpdateTime: currentTime,
						}));
					}

					return newCoords;
				});
			}
		);
	};

	const generateGPX = () => {
		const currentDate = new Date().toISOString();
		const header = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="MyApp">
		<metadata>
        <time>${currentDate}</time>
    </metadata>
    <trk>
        <name>Track ${currentDate}</name>
        <trkseg>`;

		const points = coordinates
			.map(([lon, lat]: [number, number]) => {
				return `            <trkpt lat="${lat}" lon="${lon}"></trkpt>`;
			})
			.join("\n");

		const footer = `
        </trkseg>
    </trk>
</gpx>`;

		return `${header}\n${points}\n${footer}`;
	};

	const saveGPXFile = async () => {
		const gpx = generateGPX();
		const fileName = `track_${new Date().toISOString()}.gpx`;
		const filePath = `${FileSystem.documentDirectory}${fileName}`;

		try {
			await FileSystem.writeAsStringAsync(filePath, gpx);
			setGpxContent(gpx);
			setShowPreview(true);
		} catch (error) {
			console.error("Error saving GPX file:", error);
		}
	};

	const stopTracking = () => {
		if (locationSubscription.current) {
			locationSubscription.current.remove();
			locationSubscription.current = null;
		}
		setTracking(false);
		if (coordinates.length > 0) {
			saveGPXFile();
		}
	};

	const formatMovingTime = (seconds: number) => {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const secs = Math.floor(seconds % 60);
		return `${hours.toString().padStart(2, "0")}:${minutes
			.toString()
			.padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
	};

	return (
		// @ts-ignore
		<View style={styles.container}>
			<MapboxGL.MapView
				// @ts-ignore
				style={styles.map}
				logoEnabled={false}
				styleURL={MapboxGL.StyleURL.Dark}
				scrollEnabled={false}
				pitchEnabled={false}
				focusable
			>
				<MapboxGL.Camera
					zoomLevel={18}
					followZoomLevel={16}
					followUserLocation={true}
					centerCoordinate={[location.longitude, location.latitude] || [0, 0]}
				/>

				{/* Show User's Location */}
				{location && (
					<MapboxGL.PointAnnotation
						coordinate={[location.longitude, location.latitude]}
						id="annotation"
					>
						{/* @ts-ignore */}
						<View style={styles.marker} />
					</MapboxGL.PointAnnotation>
				)}

				{/* Draw Path */}
				{coordinates.length > 1 && (
					<MapboxGL.ShapeSource
						id="line"
						shape={{
							type: "Feature",
							geometry: { type: "LineString", coordinates },
							properties: {
								color: "#FF0000",
								width: 4,
							},
						}}
					>
						<MapboxGL.LineLayer id="lineLayer" style={styles.line} />
					</MapboxGL.ShapeSource>
				)}
			</MapboxGL.MapView>

			<Modal
				visible={showPreview}
				animationType="slide"
				onRequestClose={() => setShowPreview(false)}
			>
				{/* @ts-ignore */}
				<View style={styles.modalContainer}>
					{/* @ts-ignore */}
					<Text style={styles.modalTitle}>Track Preview</Text>

					{/* Preview Map */}
					{/* @ts-ignore */}
					<View style={styles.previewMapContainer}>
						<MapboxGL.MapView
							// @ts-ignore
							style={styles.previewMap}
							logoEnabled={false}
							styleURL={MapboxGL.StyleURL.Dark}
						>
							<MapboxGL.Camera
								followZoomLevel={18}
								bounds={{
									ne: [
										Math.max(...coordinates.map((c: any) => c[0])),
										Math.max(...coordinates.map((c: any) => c[1])),
									],
									sw: [
										Math.min(...coordinates.map((c: any) => c[0])),
										Math.min(...coordinates.map((c: any) => c[1])),
									],
									// @ts-ignore
									padding: 50,
								}}
							/>
							<MapboxGL.ShapeSource
								id="previewLine"
								// @ts-ignore
								shape={{
									type: "Feature",
									geometry: { type: "LineString", coordinates },
								}}
							>
								<MapboxGL.LineLayer id="previewLineLayer" style={styles.line} />
							</MapboxGL.ShapeSource>
						</MapboxGL.MapView>
					</View>
					<View
						style={{
							flexDirection: "row",
							justifyContent: "center",
							alignItems: "center",
							flexWrap: "wrap",
							gap: 8,
						}}
					>
						<View style={{ width: "48%", alignItems: "center" }}>
							<Text>Distance</Text>
							<Text>{(stats.totalDistance / 1000).toFixed(2)} km</Text>
						</View>
						<View style={{ width: "48%", alignItems: "center" }}>
							<Text>Speed</Text>
							<Text>{stats.currentSpeed.toFixed(1)} km/h</Text>
						</View>
						<View style={{ width: "48%", alignItems: "center" }}>
							<Text>Elevation</Text>
							<Text>{stats.elevation.toFixed(0)} m</Text>
						</View>
						<View style={{ width: "48%", alignItems: "center" }}>
							<Text>Moving time</Text>
							<Text>{formatMovingTime(stats.movingTime)}</Text>
						</View>
					</View>

					{/* GPX Text Preview */}
					{/* @ts-ignore */}
					<ScrollView style={styles.previewScroll}>
						{/* @ts-ignore */}
						<Text style={styles.previewText}>{gpxContent}</Text>
					</ScrollView>

					<Button title="Close" onPress={() => setShowPreview(false)} />
				</View>
			</Modal>
			{/* @ts-ignore */}
			<View style={styles.controls}>
				<Button
					title={tracking ? "Stop Tracking" : "Start Tracking"}
					onPress={tracking ? stopTracking : startTracking}
				/>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	map: { flex: 1 },
	controls: {
		position: "absolute",
		bottom: 100,
		left: 20,
		right: 20,
		backgroundColor: "white",
		padding: 10,
		borderRadius: 10,
	},
	marker: { width: 10, height: 10, backgroundColor: "red", borderRadius: 5 },
	// @ts-ignore
	line: { lineColor: "#FF0000", lineWidth: 4 },
	modalContainer: {
		flex: 1,
		padding: 20,
		backgroundColor: "white",
		paddingTop: 60,
	},
	modalTitle: {
		fontSize: 20,
		fontWeight: "bold",
		marginBottom: 20,
	},
	previewScroll: {
		flex: 1,
		marginBottom: 20,
		backgroundColor: "#f5f5f5",
		padding: 10,
	},
	previewText: {
		fontFamily: "monospace",
	},
	previewMapContainer: {
		height: 300,
		marginBottom: 20,
		borderRadius: 10,
		overflow: "hidden",
	},
	previewMap: {
		flex: 1,
	},
	// @ts-ignore
	previewScroll: {
		height: 200,
		marginBottom: 20,
		backgroundColor: "#f5f5f5",
		padding: 10,
	},
});
