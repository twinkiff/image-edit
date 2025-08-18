<script setup>
    import Loader from './components/Loader.vue';
    import Button from './components/Button.vue';

    import Konva from 'konva';
    import heic2any from 'heic2any';

    // See https://github.com/konvajs/konva/issues/412
    Konva.pixelRatio = 2;

    import { buildDetector } from './model.ts';

    import * as faceapi from 'face-api.js';

    import { useImage } from 'vue-konva';
    import { computed, ref, useTemplateRef, watch, nextTick, onMounted, onUpdated, onUnmounted, shallowRef } from 'vue';

    const isLoading = ref(true);
    const loadingText = ref(null);

    const imageMimeType = ref(null);

    const isDisabledFacesDetection = ref(false);
    const imageNode = ref(null);
    const facesImageNodeRefs = useTemplateRef('facesImageNode');
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

    const cropConfigs = ref(null);

    const containerRef = ref(null);
    const stageRef = ref(null);

    const scale = ref(1);
    const stageWidth = ref(400);  // TODO: Default value + resize event not working
    const stageHeight = ref(600);

    const imageWidth = ref(null);
    const imageHeight = ref(null);

    const detector = shallowRef(null);

    const updateSize = () => {
      if (!containerRef.value) {  // TODO
        return;
      }
      
      // Get container width
      const containerWidth = containerRef.value.offsetWidth;
      const containerHeight = containerRef.value.offsetHeight;

      let scalingFactor = containerWidth / stageWidth.value;
      let newStageHeight = stageHeight.value * scalingFactor;
      let newStageWidth = containerWidth;

      scale.value *= scalingFactor;
      stageWidth.value = newStageWidth;
      stageHeight.value = newStageHeight;
    };

    // Add event listeners
    onMounted(async () => {
      updateSize();
      window.addEventListener('resize', updateSize);
      detector.value = await buildDetector();
      isLoading.value = false;
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
        if (cropConfigs.value !== null) {
            facesFilters.value.pixelate.active = !facesFilters.value.pixelate.active;
            return;
        }
        isDisabledFacesDetection.value = true;

        const faces = await faceapi.detectAllFaces(image.value)

        let maxWidth = 0;
        let maxHeight = 0;
        if (faces.length > 0) {
            const newCropConfigs = []

            for (let face of faces) {
                let x = face._box._x;
                let y = face._box._y;
                let width = face._box._width;
                let height = face._box._height;

                // Set crop configuration
                newCropConfigs.push({
                  // Even though it might seem redundant, everything is required in here.
                  displayX: x,
                  displayY: y,
                  displayWidth: width,
                  displayHeight: height,
                  x: x,
                  y: y,
                  width: width,
                  height: height,
                })
                
                if (width > maxWidth) {
                    maxWidth = width;
                }
                if (height > maxHeight) {
                    maxHeight = height;
                }
            }

            cropConfigs.value = newCropConfigs;
            await nextTick();
            
            for (let faceImageNodeRef of facesImageNodeRefs.value) {
                faceImageNodeRef.getNode().cache();
            }

            // Enable filter on faces
            facesFilters.value.pixelate.active = true;
            facesFilters.value.pixelate.pixelSize = Math.max(maxWidth / 10, maxHeight / 10) * Konva.pixelRatio;
        }

        isDisabledFacesDetection.value = false;
    }

    function setFacesImageNodeRef(el) {
        console.log(el);
        if (el) {
            facesImageNodeRefs.value.push(el);
        }
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
      let scalingFactor = stageWidth.value / newImage.width;

      stageWidth.value = newImage.width * scalingFactor;
      stageHeight.value = newImage.height * scalingFactor;

      imageHeight.value = newImage.height;
      imageWidth.value = newImage.width;

      scale.value = scalingFactor;

      await nextTick();
      imageNode.value.getNode().cache();
    });

    function reset() {
        imageNode.value = null;
        facesImageNodeRefs.value = [];
        image.value = null;

        imageFilters.value.blur.active = false;
        imageFilters.value.invert.active = false;
        imageFilters.value.pixelate.active = false;

        facesFilters.value.blur.active = false;
        facesFilters.value.invert.active = false;
        facesFilters.value.pixelate.active = false;

        cropConfigs.value = null;
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
                                v-for="cropConfig in cropConfigs"
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
                        <Button :action="detectFaces" :active="facesFilters.pixelate.active" label="Blur faces"/>

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
