<script setup>
    import Loader from './components/Loader.vue';
    import Button from './components/Button.vue';

    import Konva from 'konva';
    import heic2any from 'heic2any';

    import { buildDetector } from './model.ts';

    import * as faceapi from 'face-api.js';

    import { useImage } from 'vue-konva';
    import { computed, ref, watch, nextTick, onMounted, onUpdated, onUnmounted, shallowRef } from 'vue';

    const isLoading = ref(true);
    const loadingText = ref(null);

    const imageMimeType = ref(null);

    const isDisabledFacesDetection = ref(false);
    const imageNode = ref(null);
    const facesImageNode = ref(null);
    const image = ref(null);
    const imageFilters = ref({
      blur: { active: false },
      invert: { active: false },
      pixelate: { active: false, pixelSize: 8 },
    });
    const facesFilters = ref({
      blur: { active: false },
      invert: { active: false },
      pixelate: { active: false, pixelSize: 8 },
    });

    const cropConfig = ref(null);

    const containerRef = ref(null);
    const stageRef = ref(null);

    const scale = ref(1);
    const stageWidth = ref(400);  // TODO: Default value + resize event not working
    const stageHeight = ref(600);

    const imageWidth = ref(null);
    const imageHeight = ref(null);

    const detector = shallowRef(null);

    const updateSize = () => {
      if (!containerRef.value) {
        return;
      }
      
      // Get container width
      const containerWidth = containerRef.value.offsetWidth;
      const containerHeight = containerRef.value.offsetHeight;
      stageWidth.value = containerWidth;
      stageHeight.value = containerHeight;
      
      // Calculate scale
      scale.value = 1;
    };

    // Add event listeners
    onMounted(async () => {
      updateSize();
      window.addEventListener('resize', updateSize);
      detector.value = await buildDetector();
      isLoading.value = false;
    });

    onUpdated(async () => {
      //updateSize();
    });

    // Clean up
    onUnmounted(() => {
      window.removeEventListener('resize', updateSize);
    });

    const activeAllImageFilters = computed(() => {
        const active = [];
        if (imageFilters.value.blur.active) {
            active.push(Konva.Filters.Blur);
        }
        if (imageFilters.value.pixelate.active) {
            active.push(Konva.Filters.Pixelate);
        }
        if (imageFilters.value.invert.active) {
            active.push(Konva.Filters.Invert);
        }
        return active;
    });

    const activeFacesFilters = computed(() => {
        const active = [...activeAllImageFilters.value];
        if (facesFilters.value.blur.active) {
            active.push(Konva.Filters.Blur);
        }
        if (facesFilters.value.pixelate.active) {
            active.push(Konva.Filters.Pixelate);
        }
        if (facesFilters.value.invert.active) {
            active.push(Konva.Filters.Invert);
        }
        return active;
    });

    async function detectFaces() {
        if (cropConfig.value) {
            facesFilters.value.pixelate.active = !facesFilters.value.pixelate.active;
            return;
        }
        isDisabledFacesDetection.value = true;

        const faces = await faceapi.detectAllFaces(image.value)

        if (faces.length > 0) {
            // TODO: Support multiple faces
            let x = faces[0]._box._x;
            let y = faces[0]._box._y;
            let width = faces[0]._box._width;
            let height = faces[0]._box._height;

            // Set crop configuration
            cropConfig.value = {
              displayX: x,
              displayY: y,
              displayWidth: width,
              displayHeight: height,
              x: faces[0]._box._x,
              y: faces[0]._box._y,
              width: faces[0]._box._width,
              height: faces[0]._box._height,
            }

            await nextTick();
            facesImageNode.value.getNode().cache();

            // Enable filter on faces
            facesFilters.value.pixelate.active = true;
            facesFilters.value.pixelate.pixelSize = Math.max(width / 10, height / 10);
        }

        isDisabledFacesDetection.value = false;
    }
        
    async function handleFileSelect(e) {
      const input = e.target;  
      const filesAsArray = Array.from(input?.files || []);
      for (const file of filesAsArray) {
          let maybeConvertedBlob = file;
          imageMimeType.value = file.type;

          if (file.type == 'image/heif') {
              isLoading.value = true;
              loadingText.value = 'Converting HEIC image to a browser-supported format…'
              maybeConvertedBlob = await heic2any({
                  blob: file,
                  toType: 'image/jpeg',
                  quality: 0.9
              })
              imageMimeType.value = 'image/jpeg';
          }

          const reader = new FileReader();
          reader.onload = function (ev) {
              let newImage = new Image();
              newImage.onload = () => {
                 image.value = newImage;
                  isLoading.value = false;
              };
              newImage.src = ev.target.result;
          }
          reader.readAsDataURL(maybeConvertedBlob);
      }
    }

    watch(image, async (newImage) => {
      if (!newImage) {
        return;
      }

      if (stageWidth.value > newImage.width) {
          stageWidth.value = newImage.width;
          stageHeight.value = newImage.height;

          imageHeight.value = newImage.height;
          imageWidth.value = newImage.width;

          scale.value = 1;
      } else {
          // Unaltered stageWidth.value
          stageHeight.value = newImage.height / newImage.width * stageWidth.value;

          imageHeight.value = newImage.height;
          imageWidth.value = newImage.width;

          scale.value = stageWidth.value / newImage.width;
      }

      await nextTick();
      imageNode.value.getNode().cache();
    });

    function reset() {
        imageNode.value = null;
        facesImageNode.value = null;
        image.value = null;

        imageFilters.value.blur.active = false;
        imageFilters.value.invert.active = false;
        imageFilters.value.pixelate.active = false;

        facesFilters.value.blur.active = false;
        facesFilters.value.invert.active = false;
        facesFilters.value.pixelate.active = false;

        cropConfig.value = null;
    }

    function handleExport() {
      const dataURL = stageRef.value.getNode().toDataURL({
          pixelRatio: 1 / scale.value,
          mimeType: imageMimeType.value,
      });
      
      const link = document.createElement('a');
      link.download = 'stage.png';
      link.href = dataURL;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };
</script>

<template>
    <div class="bg-white w-full max-w-5xl mx-auto p-8 rounded shadow-md">
        <h1 class="text-3xl font-bold text-center mb-8">Quick edit</h1>

        <Loader v-if="isLoading" :text="loadingText" />
        <div class="grid grid-cols-2 gap-8" v-else>
            <!-- Image Preview -->
            <div :class="'col-span-2 md:col-span-1 items-center justify-center' + (image === null ? ' border border-dashed border-gray-300 rounded-md h-80 bg-gray-50' : '')" :style="{height: stageHeight + 'px'}">
                <div ref="containerRef" class="w-full h-full">
                    <span class="text-gray-400 block text-center" v-if="!image">No image uploaded</span>
                    <v-stage v-if="image" ref="stageRef" :config="{width: stageWidth, height: stageHeight, scaleX: scale, scaleY: scale}">
                        <v-layer>
                            <!-- Full image (no filter) -->
                            <v-image
                                v-if="image"
                                ref="imageNode"
                                :image="image"
                                :x="0"
                                :y="0"
                                :width="imageWidth"
                                :height="imageHeight"
                                :draggable="false"
                                :filters="activeAllImageFilters"
                                :pixelSize="imageFilters.pixelate.pixelSize"
                            />
                        </v-layer>
                        <v-layer>
                            <!-- Cropped faces from the image (filter) applied -->
                            <v-image
                                v-if="cropConfig"
                                ref="facesImageNode"
                                :x="cropConfig.displayX"
                                :y="cropConfig.displayY"
                                :width="cropConfig.displayWidth"
                                :height="cropConfig.displayHeight"
                                :crop="{ x: cropConfig.x, y: cropConfig.y, width: cropConfig.width, height: cropConfig.height }"
                                :image="image"
                                :draggable="false"
                                :filters="activeFacesFilters"
                                :pixelSize="facesFilters.pixelate.pixelSize"
                            />
                        </v-layer>
                    </v-stage>
                </div>
            </div>

            <!-- Controls -->
            <div id="controls" class="col-span-2 md:col-span-1 space-y-6">
                <!-- Buttons -->
                <form class="px-8 pt-6 pb-8 mb-4" v-if="!image">
                    <div class="mb-4">
                        <label class="block font-medium mb-2" for="upload">Upload Image</label>
                        <input type="file" @change="handleFileSelect" id="upload" accept="image/*" class="cursor-pointer block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" required />
                    </div>
                </form>
                <div class="space-y-6" v-else>
                    <div>
                        <h2>Blur:</h2>
                        <!-- TODO: Loading spinner + disabled status -->
                        <Button :action="detectFaces" :active="facesFilters.pixelate.active" label="Blur face"/>

                        <h2>Effects:</h2>
                        <!-- TODO: Image mode: B&W / colors -->
                        <Button :action="() => {imageFilters.invert.active = !imageFilters.invert.active}" :active="imageFilters.invert.active" label="Negative" />
                    </div>

                    <div class="grid grid-cols-2" v-if="image">
                        <button @click="handleExport" class="cursor-pointer bg-blue-500 text-white py-2 px-4 mr-4 rounded hover:bg-blue-600">Download</button>

                        <button @click="reset" class="cursor-pointer bg-red-500 text-white py-2 px-4 ml-4 rounded hover:bg-red-600">Cancel</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
#controls {
    z-index: 9999;
}
</style>
