import struct
import os
import json
import re
import numpy as np

sample_size = 128 


def convert_int_to_float(data):
    # Convert signed 16-bit integers to float32 normalized values from -1 to 1
    float_data = np.array(data, dtype=np.float32)
    float_data /= np.iinfo(np.int16).max
    return float_data

def save_data_to_file(data_arrays):
    # Organize the data and save it to a binary file
    with open("hrtf_"+str(sample_size)+".bin", "wb") as file:
        for elevation, azimuth, data in data_arrays:
            azimuth_bytes = struct.pack("f", azimuth)
            elevation_bytes = struct.pack("f", elevation)
            
            data_bytes = data.tobytes()

            # Write azimuth, elevation, and data to the file
            file.write(elevation_bytes)
            file.write(azimuth_bytes)
            file.write(data_bytes)

# Specify the file path
pattern = r'e(.*?)a'

file_objects = []
number_range = [x for x in range(-40, 100, 10)]
data_arrays = []
for i in number_range:
    folder_path = 'elev'+str(i)
    for filename in os.listdir(folder_path):
        file_path = os.path.join(folder_path, filename)
        if os.path.isfile(file_path):
            with open(file_path, "rb") as file:
            # Read the raw data from the file
                raw_data = file.read()
                encoded_data = []
                azi = re.findall(pattern, filename)[0] 
                for j in range(0, len(raw_data), 2):
                    sample = struct.unpack(">h", raw_data[j:j+2])[0]  # Unpack as big-endian short (16-bit)
                    encoded_data.append((sample))
                azi_key = int(azi)
                if filename.startswith("L"):
                    data_arrays.append([i, int(azi), convert_int_to_float(encoded_data[40:sample_size + 40])])
                    file_path = os.path.join(folder_path, filename.replace("L", "R", 1))
                    with open(file_path, "rb") as file:
                    # Read the raw data from the file
                        raw_data = file.read()
                        encoded_data = []
                        azi = re.findall(pattern, filename)[0] 
                        for j in range(0, len(raw_data), 2):
                            sample = struct.unpack(">h", raw_data[j:j+2])[0]  # Unpack as big-endian short (16-bit)
                            encoded_data.append((sample))
                        azi_key = int(azi)
                        print(str(len(encoded_data[40:sample_size + 40])))
                        data_arrays.append([i, int(azi), convert_int_to_float(encoded_data[40:sample_size + 40])])
                elif filename.startswith("R"):
                    continue

# Example data and positions
save_data_to_file(data_arrays)
