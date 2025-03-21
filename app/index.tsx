import { Link, useNavigation } from "expo-router";
import { Button, Text, View } from "react-native";

export default function Index() {
	const navigate = useNavigation();
	return (
		<View
			style={{
				flex: 1,
				justifyContent: "center",
				alignItems: "center",
				backgroundColor: "white",
			}}
		>
			<Text>Edit app/index.tsx to edit this screen.</Text>
			<View>
				<Link href={{ pathname: "/maps" }}>Goto Mapbox</Link>
			</View>
		</View>
	);
}
