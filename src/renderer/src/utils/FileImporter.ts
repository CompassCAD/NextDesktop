import { GraphicsRenderer } from "../engine/Engine";

export const openFileAndParse = async (renderer: GraphicsRenderer): Promise<void> => {
  const file = await window.api.showOpenFileDialog({
    title: 'Open a CompassCAD file',
    filters: [
      // { name: 'CompassCAD NEXT Files', extensions: ['cnext'] }, <- Still haven't planned on .cnext (could be an SQLite file ig)
      { name: 'CompassCAD Files', extensions: ['ccad'] },
      { name: 'QroCAD Files', extensions: ["qrocad", "qrocad2"] }
      { name: 'QroCAD Files', extensions: ["qrocad", "qrocad2"] }
    ]
  });
  console.log(file);
  if (file != undefined) {
    console.log(file);
    const filePath = file[0];
    const fileContent = window.api.readFile(filePath);
    try {
      const parsedData = JSON.parse(fileContent);
      renderer!.logicDisplay!.components = [];
      renderer?.cleanUpBeforeImport();
      renderer!.logicDisplay?.importJSON(parsedData, renderer!.logicDisplay.components);
    } catch (e) {
      console.error('[windowbar] failed to open file: ', e);
    }
  }
}
