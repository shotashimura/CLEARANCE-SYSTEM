# OpenCV の ArUco API は 4.7 で書き方が変わったため、新旧どちらでも動くように吸収する。
import cv2


def get_dictionary(dict_name):
    dict_id = getattr(cv2.aruco, dict_name)
    if hasattr(cv2.aruco, "getPredefinedDictionary"):
        return cv2.aruco.getPredefinedDictionary(dict_id)  # 新API
    return cv2.aruco.Dictionary_get(dict_id)  # 旧API


def make_detect_fn(dictionary):
    """gray画像を渡すと (corners, ids, rejected) を返す関数を作る。"""
    if hasattr(cv2.aruco, "ArucoDetector"):
        params = cv2.aruco.DetectorParameters()  # 新API
        detector = cv2.aruco.ArucoDetector(dictionary, params)
        return lambda gray: detector.detectMarkers(gray)
    params = cv2.aruco.DetectorParameters_create()  # 旧API
    return lambda gray: cv2.aruco.detectMarkers(gray, dictionary, parameters=params)


def generate_marker_image(dictionary, marker_id, side_px):
    if hasattr(cv2.aruco, "generateImageMarker"):
        return cv2.aruco.generateImageMarker(dictionary, marker_id, side_px)  # 新API
    return cv2.aruco.drawMarker(dictionary, marker_id, side_px)  # 旧API
