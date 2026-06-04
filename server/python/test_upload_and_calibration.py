import sys
import unittest
from fastapi.testclient import TestClient
import numpy as np

# Add server/python to path if needed
sys.path.insert(0, ".")

from api.gateway import app

class TestUploadAndCalibration(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_case_insensitive_technique(self):
        # Create a basic two-column CSV signal
        csv_data = "x,y\n" + "\n".join(f"{i},{10 + (100 if i==30 else 0)}" for i in range(10, 60))
        
        # Test lower-case "xps"
        response = self.client.post(
            "/api/v1/analysis/upload",
            files={"file": ("test_xps.csv", csv_data, "text/csv")},
            data={"technique": "xps"}
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["technique"], "XPS")

        # Test mixed-case "RaMaN"
        response = self.client.post(
            "/api/v1/analysis/upload",
            files={"file": ("test_raman.csv", csv_data, "text/csv")},
            data={"technique": "RaMaN"}
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["technique"], "Raman")

    def test_coordinate_returns_all_techniques(self):
        csv_data = "x,y\n" + "\n".join(f"{i},{10 + (100 if i==30 else 0)}" for i in range(10, 60))
        
        for tech in ["xrd", "XPS", "ftir", "RAMAN"]:
            response = self.client.post(
                "/api/v1/analysis/upload",
                files={"file": (f"test_{tech}.csv", csv_data, "text/csv")},
                data={"technique": tech}
            )
            self.assertEqual(response.status_code, 200, f"Failed for {tech}")
            data = response.json()
            self.assertIn("x", data)
            self.assertIn("y", data)
            self.assertIsInstance(data["x"], list)
            self.assertIsInstance(data["y"], list)
            self.assertEqual(len(data["x"]), 50)
            self.assertEqual(len(data["y"]), 50)

    def test_ftir_transmittance_inversion(self):
        # Generate transmittance data: high background (90) with a dip at 1630
        points = []
        for x in range(400, 4000, 10):
            # Dip at 1630
            y = 90.0 - 50.0 * np.exp(-0.5 * ((x - 1630.0) / 40.0) ** 2)
            points.append(f"{x},{y}")
        csv_data = "wavenumber,transmittance\n" + "\n".join(points)

        response = self.client.post(
            "/api/v1/analysis/upload",
            files={"file": ("ftir_trans.csv", csv_data, "text/csv")},
            data={"technique": "ftir"}
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        
        # Verify that the dip around 1630 is correctly detected as a peak/band
        features = data["parsed_features"]
        self.assertTrue(len(features) > 0, "No bands detected in transmittance data")
        
        # The primaryAxis of the first band should be close to 1630
        band_pos = features[0]["primaryAxis"]
        self.assertAlmostEqual(band_pos, 1630, delta=15)
        self.assertIn("FTIR band in OH bending / carbonate region", features[0]["label"])

    def test_xps_safe_calibration_c1s(self):
        # Generate XPS data with adventitious carbon peak shifted to 285.4 eV (shift of -0.6 eV)
        points = []
        for x in np.arange(280.0, 300.0, 0.1):
            # Peak at 285.4 eV, prominence ~80, noise ~1
            y = 10.0 + 80.0 * np.exp(-0.5 * ((x - 285.4) / 0.8) ** 2) + np.sin(x * 10) * 0.5
            points.append(f"{x:.2f},{y:.2f}")
        csv_data = "be,counts\n" + "\n".join(points)

        response = self.client.post(
            "/api/v1/analysis/upload",
            files={"file": ("xps_c1s.csv", csv_data, "text/csv")},
            data={"technique": "xps"}
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        
        # Verify calibration metadata
        cal_meta = data["calibration_metadata"]
        self.assertEqual(cal_meta["status"], "calibrated")
        self.assertEqual(cal_meta["reference_type"], "C 1s")
        self.assertAlmostEqual(cal_meta["energy_shift"], -0.6, delta=0.1)
        self.assertEqual(cal_meta["confidence"], "high")

        # Verify coordinates are shifted
        # Unshifted peak at 285.4 should correspond to shifted coordinate 284.8
        # Let's verify peak feature in response
        features = data["parsed_features"]
        self.assertTrue(len(features) > 0)
        self.assertAlmostEqual(features[0]["primaryAxis"], 284.8, delta=0.15)
        self.assertIn("XPS peak in C 1s region", features[0]["label"])

    def test_xps_safe_calibration_o1s(self):
        # Generate XPS data with O 1s peak shifted to 531.0 eV (shift of -1.2 eV)
        points = []
        for x in np.arange(525.0, 540.0, 0.1):
            # Peak at 531.0 eV, prominence ~80, noise ~1
            y = 10.0 + 80.0 * np.exp(-0.5 * ((x - 531.0) / 0.8) ** 2) + np.sin(x * 10) * 0.5
            points.append(f"{x:.2f},{y:.2f}")
        csv_data = "be,counts\n" + "\n".join(points)

        response = self.client.post(
            "/api/v1/analysis/upload",
            files={"file": ("xps_o1s.csv", csv_data, "text/csv")},
            data={"technique": "xps"}
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        
        # Verify calibration metadata
        cal_meta = data["calibration_metadata"]
        self.assertEqual(cal_meta["status"], "calibrated")
        self.assertEqual(cal_meta["reference_type"], "O 1s")
        self.assertAlmostEqual(cal_meta["energy_shift"], -1.2, delta=0.1)
        self.assertEqual(cal_meta["confidence"], "medium")

        # Verify coordinates are shifted (531.0 -> 529.8)
        features = data["parsed_features"]
        self.assertTrue(len(features) > 0)
        self.assertAlmostEqual(features[0]["primaryAxis"], 529.8, delta=0.15)
        self.assertIn("XPS peak in O 1s region", features[0]["label"])

    def test_xps_no_calibration_reference(self):
        # Generate random noise (no peaks above threshold)
        points = []
        for x in np.arange(280.0, 300.0, 0.1):
            y = 10.0 + np.sin(x * 5) * 2.0
            points.append(f"{x:.2f},{y:.2f}")
        csv_data = "be,counts\n" + "\n".join(points)

        response = self.client.post(
            "/api/v1/analysis/upload",
            files={"file": ("xps_noise.csv", csv_data, "text/csv")},
            data={"technique": "xps"}
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        # Verify calibration metadata is skipped
        cal_meta = data["calibration_metadata"]
        self.assertEqual(cal_meta["status"], "skipped_no_reference")
        self.assertEqual(cal_meta["reference_type"], "None")
        self.assertEqual(cal_meta["energy_shift"], 0.0)
        self.assertEqual(cal_meta["confidence"], "low")

if __name__ == "__main__":
    unittest.main()
