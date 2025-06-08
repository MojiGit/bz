
<!-- JavaScript logic to reflect selection -->

  const selector = document.getElementById('assetSelector');
  const output = document.getElementById('selectedAsset');

  selector.addEventListener('change', () => {
    output.textContent = `Selected Asset: ${selector.value}`;
  });
