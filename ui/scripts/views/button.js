export function createButton(label, action, parent, signal) {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = label;
  node.addEventListener('click', action, { signal });
  parent.append(node);
  return node;
}
