sap.ui.define([
  "sap/ui/core/Fragment",
  "sap/m/SearchField",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/table/Column",
  "sap/m/Label",
  "sap/m/Text"
], function (Fragment, SearchField, Filter, FilterOperator, UIColumn, Label, Text) {
  "use strict";

  function _applyFilter(oDialog, sQuery, aProps, oOptions) {
    oDialog.getTableAsync().then(function (oTable) {
      var oBinding = oTable.getBinding("rows") || oTable.getBinding("items");
      if (!oBinding) return;

      var aFilterProps = aProps.slice();

      // Regola: se supero la lunghezza chiave, escludo il campo chiave (es. "Customer")
      if (oOptions?.maxKeyLength && sQuery && sQuery.length > oOptions.maxKeyLength && oOptions.keyProp) {
        aFilterProps = aFilterProps.filter(p => p !== oOptions.keyProp);
      }

      var aInner = [];
      if (sQuery && sQuery.trim()) {
        aInner = aFilterProps.map(p => new Filter(p, FilterOperator.Contains, sQuery));
      }

      oBinding.filter(aInner.length ? new Filter(aInner, false) : []);
      oDialog.update();
    });
  }

  return {
    /**
     * Apre un ValueHelpDialog generico.
     * @param {sap.ui.core.mvc.Controller} oController
     * @param {string} sFragmentName
     * @param {string} sModelName
     * @param {string} sEntityPath es. "/I_Customer_VH"
     * @param {object} oSettings { key, desc, filterProps[], columns[], multiInputId, maxKeyLength, keyProp }
     */
    openValueHelp: function (oController, sFragmentName, sModelName, sEntityPath, oSettings) {
      Fragment.load({ name: sFragmentName, controller: oController }).then(function (oDialog) {

        // Basic search collegata alla FilterBar
        var oBasicSearch = new SearchField({
          width: "100%",
          liveChange: function (oEvent) {
            _applyFilter(oDialog, oEvent.getParameter("newValue"), oSettings.filterProps, {
              maxKeyLength: oSettings.maxKeyLength,
              keyProp: oSettings.keyProp
            });
          }
        });

        oDialog.setKey(oSettings.key);
        oDialog.setDescriptionKey(oSettings.desc);
        oDialog.setRangeKeyFields([{ key: oSettings.key, label: oSettings.key, type: "string" }]);
        oDialog.setTokenDisplayBehaviour("descriptionAndId");

        var oFilterBar = oDialog.getFilterBar();
        oFilterBar.setFilterBarExpanded(false);
        oFilterBar.setBasicSearch(oBasicSearch);
        oFilterBar.attachSearch(function (oEvent) {
          var oFB = oEvent.getSource();
          // Costruisco una query unica prendendo il primo campo non vuoto (oppure la basic search)
          var sQuery =
            oBasicSearch.getValue().trim() ||
            oSettings.filterProps
              .map(function (p) { return oFB.determineControlByName(p)?.getValue().trim(); })
              .find(Boolean) || "";
          _applyFilter(oDialog, sQuery, oSettings.filterProps, {
            maxKeyLength: oSettings.maxKeyLength,
            keyProp: oSettings.keyProp
          });
        });

        oDialog.getTableAsync().then(function (oTable) {
          oTable.setModel(oController.getOwnerComponent().getModel(sModelName));
          console.log("Model found:", oController.getOwnerComponent().getModel(sModelName));
          oTable.bindRows({ path: sEntityPath });

          oSettings.columns.forEach(function (c) {
            oTable.addColumn(new UIColumn({
              label: new Label({ text: c.label }),
              template: new Text({ text: `{${c.path}}` })
            }));
          });

          oDialog.update();
        });

        // Token: persistenza + OK/Cancel
        var oMultiInput = oController.byId(oSettings.multiInputId);
        if (oMultiInput) {
          oDialog.setTokens(oMultiInput.getTokens());
        }

        oDialog.attachOk(function (oEvent) {
          if (oMultiInput) {
            oMultiInput.setTokens(oEvent.getParameter("tokens"));
          }
          oDialog.close();
        });

        oDialog.attachCancel(function () {
          oDialog.close();
        });

        oDialog.attachAfterClose(function () {
          oDialog.destroy();
        });

        // Avvia con una ricerca vuota per popolare
        oDialog.attachAfterOpen(function () {
          oFilterBar.search();
        });

        oDialog.open();
      });
    }
  };
});
