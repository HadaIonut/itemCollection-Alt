//@ts-ignore
import ItemSheet5e from "../../../systems/dnd5e/module/item/sheet.js";
import { MODULE_NAME } from "./settings.js";

// let knownSheets = {};
// let templates = {};
let canAlwaysAddToBag;
let canAlwaysAddToBagTypes;

Hooks.once("ready", () => {
  canAlwaysAddToBag = game.i18n.localize(MODULE_NAME+".canAlwaysAddToBag");
  canAlwaysAddToBagTypes = game.i18n.localize(MODULE_NAME+".canAlwaysAddToBagTypes");
});

export class ItemSheet5eSpellbook extends ItemSheet5e {

  item: any;
  options: any;
  constructor(...args) {
    super(...args);
    this.options.width = 570;
    this.options.height = 500;
    // this.item = args[0];
  }

  /** @override */  
  static get defaultOptions() {
    const options = super.defaultOptions;
    mergeObject(options, {
      width: 570,
      height: 500,
      //@ts-ignore
      showUnpreparedSpells: true
    });
    return options;
  }

  /** @override */
  get template() {
    return `/modules/${MODULE_NAME}/templates/spellbook-sheet.html`;
  }

  //@ts-ignore
  render(...args) {
    super.render(...args);
  }
  //@ts-ignore
  async _onSubmit(event, {updateData=null, preventClose=false}={}) {
      super._onSubmit(event, {updateData, preventClose})
  }
  blankCurrency = {pp: 0, gp: 0, ep: 0, sp: 0, cp: 0};

  /** @override */
  async getData(options) {
    const type = this.item.type;

    if (!["backpack"].includes(type)) {
      ui.notifications.error(game.i18n.localize(MODULE_NAME+".wrongType"))
      this.options.editable = false;
      options.editable = false;
      return super.getData(options);
    };
 
    const item = this.item;
    var data:any = await super.getData(options);
    data.flags = duplicate(item.data.flags);
    // setProperty(data.flags.itemcollection, "contentsData", await this.item.getFlag("itemcollection", "contentsData"));


    if (!hasProperty(data.flags, MODULE_NAME+".bagWeight"))
      setProperty(data.flags, MODULE_NAME+".bagWeight", 0);
    if (!hasProperty(data.flags, MODULE_NAME+".goldValue"))
      setProperty(data.flags,MODULE_NAME+".goldValue",  0);
    if (!hasProperty(data.flags, MODULE_NAME+".contentsData"))
      setProperty(data.flags,MODULE_NAME+".contentsData", []);
    if (!hasProperty(data.flags, MODULE_NAME+".importSpells"))
      setProperty(data.flags,MODULE_NAME+".importSpells", false);
    
    //this.baseapps.options.editable = this.baseapps.options.editable// && (!this.item.actor || !this.item.actor.token);
    data.hasDetails = true;
    if (game.settings.get(MODULE_NAME, "sortBagContents")) {
      data.flags.itemcollection.contentsData.sort((a,b) => {
        if (a.type === "spell" && b.type !== "spell") return 1;
        if (a.type !== "spell" && b.type === "spell") return -1;
        // if (a.type !== b.type) return (a.type < b.type ? -1 : 1);
        if (a.type !== "spell") return (a.name < b.name ? -1 : 1);
        if (a.data.level !== b.data.level) return (a.data.level - b.data.level);
        return a.name < b.name ? -1 : 1;
      });
    }
    data.isGM = game.user.isGM;
    //TODO check this out
    console.log(data)
    for (let i of data.flags.itemcollection.contentsData){
      i.isBackpack = i.type === "backpack"
      i.isSpell = i.type === "spell";
    }
    data.canImportExport = !!item.parent;
    data.isOwned = !!item.parent;
    data.canConvertToGold = game.settings.get(MODULE_NAME, 'goldConversion');
    data.totalGoldValue = this.item.calcPrice();
    data.itemsWeight = this.item.calcItemWeight();
    data.weight = this.item.calcWeight();
    parent = this.item.parent;
    data.parentName = "";
    while (parent) {
      data.parentName += `<- ${parent.name} `
      parent = parent.parent;
    }
    if (data.parentName.length > 0) data.parentName = `(${data.parentName})`
    return data;
  }


  async _onDragItemStart(event) {
    event.stopPropagation();
    const items = this.item.getFlag(MODULE_NAME, "contents");
    const itemId = event.currentTarget.dataset.itemId;
    let item = this.item.items.get(itemId);
    event.dataTransfer.setData("text/plain", JSON.stringify({
      type: "Item",
      data: item
    }));
    await this.item.deleteEmbeddedDocuments("Item", [itemId]);
    //this.render(false);
  }

  canAdd(itemData) {
    // Check that the item is not too heavy for the bag.
    let bagCapacity = this.item.data.data.capacity.value;
    if (bagCapacity === 0) return true;
    if (canAlwaysAddToBagTypes.some(name=>itemData.name.includes(name))) return true;
    if (canAlwaysAddToBag.includes(itemData.name)) return true;

    let itemQuantity = itemData.data.quantity || 1;
    if (this.item.data.data.capacity.type === "items") {
      const itemCount = this.item.containedItemCount()
      return itemCount + itemQuantity <= bagCapacity;
    }
    let newWeight = this.item.calcItemWeight() + (itemData.data.weight ?? 0) * itemQuantity;
    return bagCapacity >= newWeight;
  }

  async _isSpell(data) {
    if (data.data) {
      return data.data.type === 'spell'
    } else if (data.pack) {
      //@ts-ignore
      const item = await game.packs.get(data.pack).getDocument(data.id);
      return item.data.type === 'spell'
    }
    else {
      return game.items.get(data.id).data.type === 'spell'
    }
  }

  async _onDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData('text/plain'));
      if ( !(await this._isSpell(data)) ) {
        console.log("ItemCollection | Bags only accept items");
        return false;
      }
    }
    catch (err) {
      console.log("ItemCollection | drop error")
      console.log(event.dataTransfer.getData('text/plain'));
      console.log(err);
      return false;
    }
    // Case 1 - Data explicitly provided
    let actor = game.actors.get(data.actorId);
    
    if (data.tokenId) {
      const uuid = `Scene.${data.sceneId}.Token.${data.tokenId}`;
      const tokenDocument = await fromUuid(uuid);
      //@ts-ignore .actor
      if (tokenDocument) actor = tokenDocument.actor;
    }
    if ( data.data ) {
      // Check up the chain that we are not dropping one of our parents onto us.
      let canAdd = this.item.id !== data.data._id;
      parent = this.item.parent;
      let count = 0;
      while (parent && count < 10) { // Don't allow drops of anything in the parent chain or the item will disappear.
        count += 1;
        //@ts-ignore parent.id
        canAdd = canAdd && (parent.id !== data.data._id);;
        parent = parent.parent;
      }
      if (!canAdd) {
        console.log("ItemCollection | Cant drop on yourself");
        ui.notifications.info(game.i18n.localize('itemcollection.ExtradimensionalVortex'));
        throw new Error("Dragging bag onto istelf or ancestor opens a planar vortex and you are sucked into it")
      }
      // drop from player characters or another bag.
      if (this.canAdd(data.data)) {
          // will fit in the bag so add it to the bag and delete from the owning actor if there is one.
          let toDelete = data.data._id;
          await this.item.createEmbeddedDocuments("Item", [data.data]);
          //@ts-ignore deleteEmbeddedDocuments
          if (actor && (actor.data.type === "character" || actor.isToken)) await actor.deleteEmbeddedDocuments("Item", [toDelete]);
          return false;
      }
      // Item will not fit in the bag what to do?
      else if (this.item.parent) { // this bag is owned by an actor - drop into the inventory instead.
          //@ts-ignore
          if (actor && actor.data.type === "character") await actor.deleteEmbeddedDocuments("Item", [data.data._id]);
          await this.item.parent.createEmbeddedDocuments("Item", [data.data]);
          ui.notifications.info(game.i18n.localize('itemcollection.AlternateDropInInventory'));
          return false;
      }
      // Last resort accept the drop anyway so that the item wont disappear.
      else if (!actor) await this.item.createEmbeddedDocuments("Item", [data.data]); 
    }

    // Case 2 - Import from a Compendium pack
    else if ( data.pack ) {
      this._importItemFromCollection(data.pack, data.id);
    }

    // Case 3 - Import from World entity
    else {
      let item = game.items.get(data.id);
      if (this.canAdd(item.data)) { // item will fit in the bag
        //@ts-ignore toJSON
        const itemData = item.data.toJSON();
        await this.item.createEmbeddedDocuments("Item", [itemData]);
      } else {
        console.log(`ItemCollection | no room in bag for dropped item`);
        ui.notifications.info(game.i18n.localize('itemcollection.NoRoomInBag'));
      }
    }
    return false;
  }

  async _importItemFromCollection(collection, entryId) {
    //@ts-ignore
    let item = await game.packs.get(collection).getDocument(entryId);
    if (!item) return;
    //@ts-ignore toJSON
    return this.item.createEmbeddedDocuments("Item", item.data.toJSON())
  }


  async _itemExport(event) {
    let id = $(event.currentTarget).parents(".item-controls").attr("data-item-id");
    if (!this.item.parent) return;
    const item = this.item.items.get(id);
    if (!item) {
      console.error(`Item ${id} not found`)
    }
    Hooks.once("updateItem", () => {
      this.item.parent.createEmbeddedDocuments("Item", [item.data.toJSON()])
    });
    await this.item.deleteEmbeddedDocuments("Item", [item.id])
    this.render();
  }

  async _exportAll(event) {
    if (!isNewerVersion(game.data.version, "0.8.9")) {
      ui.notifications.warn("Disabled due to bugs - use drag and drop or single item export");
      return;
    }
    if (!this.item.parent) return;
    if (this.item.items.length === 0) return;
    const itemsData = duplicate(getProperty(this.item.data.flags, "itemcollection.contentsData") ?? []);
    const toDelete = itemsData.map(idata => idata._id);
    await this.item.parent.createEmbeddedDocuments("Item", itemsData);
    await this.updateParentCurrency(this.item.data.data.currency);
    await this.item.deleteEmbeddedDocuments("Item", toDelete)
    // this.render(true);
  }
  
  getParentCurrency() {
    if (!this.item.parent) return;
    return this.item.parent.data.data.currency;
  }

  async setParentCurrency(currency) {
    if (!this.item.parent) return;
    this.item.parent.update({"data.currency": currency});
  }
  async updateParentCurrency(addedCurrency) {
    const existingCurrency = this.getParentCurrency();
    // TODO add the currencies together
    const newCurrency = duplicate(this.blankCurrency);

    for (let key of Object.keys(this.blankCurrency)) {
      newCurrency[key] = (addedCurrency[key] ?? 0) + (existingCurrency[key] ?? 0);
    }
    Hooks.once("updateItem", () => {
      this.setParentCurrency(newCurrency);
    })
    await this.item.update({"data.currency": this.blankCurrency})
  }
  
  async _editItem(ev) {
    const id = $(event.currentTarget).parents(".item-controls").attr("data-item-id");
    let item = this.item.items.get(id);
    if (!item) throw new Error(`Item ${id} not found in Bag ${this.item._id}`);
    // let item = this.items[idx];
    item.sheet.render(true);
    return;
  }

  _onItemSummary(event) {
    return;
    event.preventDefault();
    let li = $(event.currentTarget).parents(".item"),
        item = this.item.items.get(li.data("item-id")),
        chatData = item.getChatData({secrets: game.user.isGM});

      // Toggle summary
      if ( li.hasClass("expanded") ) {
        let summary = li.children(".item-summary");
        summary.slideUp(200, () => summary.remove());
      } else {
        let div = $(`<div class="item-summary">${chatData.description.value}</div>`);
        let props = $(`<div class="item-properties"></div>`);
        chatData.properties.forEach(p => props.append(`<span class="tag">${p}</span>`));
        div.append(props);
        li.append(div.hide());
        div.slideDown(200);
      }
      li.toggleClass("expanded");
  }

  _filterSpells(event, spellLines) {
    [...spellLines].forEach((spellLine) => {
      const spellName = $(spellLine).attr('data-item-name');
      if (!spellName.toLowerCase().includes(event.target.value.toLowerCase())) {
        $(spellLine).hide()
      }
      else $(spellLine).show()
    })
  }

  activateListeners(html) {
    super.activateListeners(html);

    const spellLines = html.find('.spellbook-spell-table').children();
    // Everything below is only needed if the sheet is editable
    if ( !this.options.editable ) return;
    // Make the Actor sheet droppable for Items if it is not owned by a token or npc
    if (this.item.type === "backpack" /*|| this.item.type === "loot"*/) {
      //@ts-ignore TODO fix this
        this.form.ondragover = ev => this._onDragOver(ev);
      //@ts-ignore
      this.form.ondrop = ev => this._onDrop(ev);

        html.find('.spellDisplay-table-row-tr').each((i, li) => {
          li.setAttribute("draggable", true);
          li.addEventListener("dragstart", this._onDragItemStart.bind(this), false);
        });

        document.addEventListener("dragend", this._onDragEnd.bind(this));
        // html[0].ondragend = this._onDragEnd.bind(this);
        html.find('.item .item-name.rollable h4').click(event => this._onItemSummary(event));
    }

    html.find("input").focusout(this._onUnfocus.bind(this));

      // Delete Inventory Item
    html.find('.item-delete').click(async ev => {
      const itemId = $(ev.currentTarget).parents(".item-controls").attr("data-item-id");
      await this.item.deleteEmbeddedDocuments("Item", [itemId]);
      this.render();
    });

    html.find('.item-edit').click(ev => this._editItem(ev));
    html.find('.item-export-all').click(ev => this._exportAll(event));
    html.find('.item-export').click(ev => this._itemExport(ev));
    html.find('.item-import-all').click(ev => this._importAllItemsFromParent(this.item.parent));
    html.find('.item .item-name h4').click(event => this._onItemSummary(event));
    html.find('.spell-filter').on('input', event => this._filterSpells(event, spellLines))
  }

  async _importAllItemsFromParent(parent) {
    if (!isNewerVersion(game.data.version, "0.8.9")) {
      ui.notifications.warn("Disabled due to bugs - use drag and drop");
      return;
    }
    if (!parent) return;
    const itemsToImport = [];
    for (let testItem of parent.items) {
      if (["weapon", "equipment", "consumable", "tool", "loot", "spell"].includes(testItem.type))
        itemsToImport.push(testItem.data.toJSON());
    }
    const itemsToDelete = itemsToImport.map(itemData => itemData._id);
    await this.item.createEmbeddedDocuments("Item", itemsToImport);
    await parent.deleteEmbeddedDocuments("Item", itemsToDelete);

    this.render();
  }

  _onDragEnd(event) {
    event.preventDefault();
    return false;
  }
  _onDragOver(event) {
    event.preventDefault();
    return false;
  }

  _onUnfocus(event) {
    //@ts-ignore
    this._submitting = true;
    setTimeout(() => {
      let hasFocus = $(":focus").length;
      if ( !hasFocus ) {
        this._onSubmit(event);
      }
      //@ts-ignore
      this._submitting = false;
    }, 25);
  }
}
